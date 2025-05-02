// app.js - Update MongoDB connection for Docker

// Load environment variables
require('dotenv').config();

// At the top of the file, add:
const MONGODB_URI = process.env.MONGODB_URI;
const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { generateKeyPair } = require('./utils/cryptoUtils');

// Environment variable validation
const requiredEnvVars = ['MONGODB_URI', 'SESSION_SECRET'];
const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('Variables d\'environnement manquantes:', missingEnvVars.join(', '));
  process.exit(1);
}

// Add these constants at the top
const SALT_ROUNDS = 12;
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const ALGORITHM = 'aes-256-cbc';
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours

// Add file validation constants
const MAX_FILE_SIZE = process.env.MAX_FILE_SIZE || 50 * 1024 * 1024; // 50MB
const ALLOWED_FILE_TYPES = [
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel.sheet.macroEnabled.12',
  'application/vnd.ms-excel.sheet.binary.macroEnabled.12'
];

// Add cleanup configuration
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours
const FILE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

// Function to clean up old files
const cleanupOldFiles = () => {
  const now = Date.now();
  
  const cleanupDirectory = (dir) => {
    if (!fs.existsSync(dir)) return;
    
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stats = fs.statSync(filePath);
      
      if (stats.isDirectory()) {
        cleanupDirectory(filePath);
        // Remove empty directories
        if (fs.readdirSync(filePath).length === 0) {
          fs.rmdirSync(filePath);
        }
      } else if (now - stats.mtimeMs > FILE_MAX_AGE) {
        fs.unlinkSync(filePath);
      }
    });
  };
  
  cleanupDirectory(UPLOAD_DIR);
};

// Schedule cleanup
setInterval(cleanupOldFiles, CLEANUP_INTERVAL);

// Initialize app
const app = express();
const port = process.env.PORT || 3000;

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Connected to MongoDB');
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// Configure middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));
app.set('view engine', 'ejs');

const MongoStore = require('connect-mongo');

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: true, // Changed to true to ensure session is saved
    saveUninitialized: true, // Changed to true to save uninitialized sessions
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions',
        ttl: SESSION_MAX_AGE / 1000, // Convert to seconds
        autoRemove: 'native', // Automatically remove expired sessions
        touchAfter: 24 * 3600 // Only update session once per day
    }),
    cookie: { 
        secure: process.env.NODE_ENV === 'production', // true if using HTTPS
        httpOnly: true,
        sameSite: 'strict',
        maxAge: SESSION_MAX_AGE
    }
}));

// Add session verification middleware
app.use((req, res, next) => {
    console.log('Session:', req.session);
    next();
});

// Add security headers middleware
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
});

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, 'uploads', req.session.userId || 'temp');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    // Sanitize filename
    const sanitizedFilename = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, Date.now() + '-' + sanitizedFilename);
  }
});

const fileFilter = (req, file, cb) => {
  // Allow encrypted files for decryption
  if (file.originalname.endsWith('.enc')) {
    return cb(null, true);
  }
  
  // For encryption, check allowed file types
  if (ALLOWED_FILE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier invalide. Seuls les fichiers CSV et Excel sont autorisés.'), false);
  }
};

const upload = multer({ 
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

// User model
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  publicKey: { type: String },
  encryptedPrivateKey: { type: String },
  keySalt: { type: String },
  iv: { type: String },
  keyCreated: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);

// Routes
app.get('/', (req, res) => {
  if (req.session.userId) {
    res.redirect('/dashboard');
  } else {
    res.render('index');
  }
});

app.get('/register', (req, res) => {
  res.render('register');
});

app.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).send('Email already registered');
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    const newUser = new User({
      name,
      email,
      password: hashedPassword
    });
    
    await newUser.save();
    res.redirect('/login');
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).send('Error during registration');
  }
});

app.get('/login', (req, res) => {
  res.render('login');
});

app.post('/login', async (req, res) => {
  try {
    console.log('Login body:', req.body);

    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      console.log('User not found for email:', email);
      if (req.headers['content-type'] === 'application/json') {
        return res.status(400).json({ error: 'Invalid email or password' });
      }
      return res.status(400).send('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      console.log('Password mismatch for user:', email);
      if (req.headers['content-type'] === 'application/json') {
        return res.status(400).json({ error: 'Invalid email or password' });
      }
      return res.status(400).send('Invalid email or password');
    }

    console.log('Login successful for:', user.email);

    // Regenerate session to prevent session fixation
    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).send('Error during login');
      }

      // Set session data
      req.session.userId = user._id;
      req.session.userEmail = user.email;
      req.session.userName = user.name;
      req.session.isAuthenticated = true;

      // Save session
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          return res.status(500).send('Error during login');
        }

        console.log('Session saved:', req.session);

        if (req.headers['content-type'] === 'application/json') {
          return res.json({ 
            success: true, 
            redirect: '/dashboard',
            session: req.session
          });
        }
        return res.redirect('/dashboard');
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    if (req.headers['content-type'] === 'application/json') {
      return res.status(500).json({ error: 'Error during login' });
    }
    return res.status(500).send('Error during login');
  }
});

app.get('/dashboard', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  try {
    const user = await User.findById(req.session.userId);
    
    if (!user.keyCreated) {
      return res.redirect('/generate-keys');
    }
    
    res.render('dashboard', { 
      userName: user.name, 
      userEmail: user.email,
      hasKeys: user.keyCreated
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).send('Error loading dashboard');
  }
});

app.get('/generate-keys', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  res.render('generate-keys');
});

// app.post('/generate-keys', async (req, res) => {
//   if (!req.session.userId) {
//     return res.status(401).json({ error: 'Not authenticated' });
//   }
  
//   try {
//     const { password } = req.body;
    
//     // Generate RSA key pair
//     const { publicKey, privateKey } = await generateKeyPair();
    
//     // Encrypt private key with user's password
//     const cipher = crypto.createCipheriv('aes-256-cbc', password);
//     let encryptedPrivateKey = cipher.update(privateKey, 'utf8', 'hex');
//     encryptedPrivateKey += cipher.final('hex');
    
//     // Update user with keys
//     await User.findByIdAndUpdate(req.session.userId, {
//       publicKey,
//       encryptedPrivateKey,
//       keyCreated: true
//     });
    
//     res.json({ 
//       success: true, 
//       publicKey,
//       privateKey, // Only sent during initial generation
//       message: 'Keys generated successfully. Please save your private key securely.'
//     });
//   } catch (error) {
//     console.error('Key generation error:', error);
//     res.status(500).json({ error: 'Error generating keys' });
//   }
// });

// Update this part in your app.js
app.post('/generate-keys', async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  
  try {
    const { password } = req.body;
    
    // Generate RSA key pair
    const { publicKey, privateKey } = await generateKeyPair();
    
    // Generate a unique salt for this user's key derivation
    const keySalt = crypto.randomBytes(16).toString('hex');
    
    // Create a key from the password using PBKDF2
    const key = crypto.pbkdf2Sync(
      password,
      keySalt,
      100000, // iterations
      KEY_LENGTH,
      'sha512'
    );
    
    // Generate a random initialization vector
    const iv = crypto.randomBytes(IV_LENGTH);
    
    // Encrypt private key with user's password
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encryptedPrivateKey = cipher.update(privateKey, 'utf8', 'hex');
    encryptedPrivateKey += cipher.final('hex');
    
    // Store both the IV and the encrypted private key
    const ivHex = iv.toString('hex');
    
    // Update user with keys
    await User.findByIdAndUpdate(req.session.userId, {
      publicKey,
      encryptedPrivateKey,
      keySalt,
      iv: ivHex,
      keyCreated: true
    });
    
    res.json({ 
      success: true, 
      publicKey,
      privateKey, // Only sent during initial generation
      message: 'Keys generated successfully. Please save your private key securely.'
    });
  } catch (error) {
    console.error('Key generation error:', error);
    res.status(500).json({ error: 'Error generating keys' });
  }
});

app.get('/encrypt', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  res.render('encrypt');
});

app.get('/decrypt', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  res.render('decrypt');
});

// app.get('/users', async (req, res) => {
//   if (!req.session.userId) {
//     return res.redirect('/login');
//   }
  
//   try {
//     // Only fetch name, email and public key
//     const users = await User.find({}, 'name email publicKey');
//     res.render('users', { users });
//   } catch (error) {
//     console.error('Users listing error:', error);
//     res.status(500).send('Error fetching users');
//   }
// });

app.get('/users', async (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }

  try {
    const users = await User.find({}, 'name email publicKey');
    res.render('users', { users });
  } catch (error) {
    console.error('Erreur lors de la récupération des utilisateurs:', error);
    res.status(500).send('Erreur lors de la récupération des utilisateurs');
  }
});


app.post('/upload-encrypt', upload.single('file'), async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Aucun fichier téléchargé ou type de fichier invalide' });
    }

    const { recipientUserId } = req.body;
    const recipient = await User.findById(recipientUserId);
    
    if (!recipient || !recipient.publicKey) {
      return res.status(400).json({ error: 'Destinataire invalide ou destinataire sans clé publique' });
    }
    
    // Path to the uploaded file
    const filePath = req.file.path;
    
    // Generate a random AES key and IV
    const aesKey = crypto.randomBytes(32); // 256 bits
    const iv = crypto.randomBytes(16); // 128 bits
    
    // Create AES cipher for file encryption
    const cipher = crypto.createCipheriv('aes-256-cbc', aesKey, iv);
    
    // Read file in chunks and encrypt
    const input = fs.createReadStream(filePath);
    const encryptedFilePath = filePath + '.enc';
    const output = fs.createWriteStream(encryptedFilePath);
    
    // Encrypt the file using AES
    input.pipe(cipher).pipe(output);
    
    // Wait for the encryption to complete
    await new Promise((resolve, reject) => {
      output.on('finish', resolve);
      output.on('error', reject);
    });
    
    // Encrypt the AES key with recipient's public key using OAEP padding
    const encryptedKey = crypto.publicEncrypt(
      {
        key: recipient.publicKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      Buffer.concat([aesKey, iv])
    );
    
    // Append the encrypted key to the encrypted file
    fs.appendFileSync(encryptedFilePath, encryptedKey);
    
    // Clean up original file
    fs.unlinkSync(filePath);
    
    res.json({
      success: true,
      encryptedFile: path.basename(encryptedFilePath),
      message: 'Fichier chiffré avec succès'
    });
  } catch (error) {
    console.error('Erreur lors du chiffrement du fichier:', error);
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Erreur lors du chiffrement du fichier' });
  }
});

app.post('/upload-decrypt', upload.single('file'), async (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Non authentifié' });
  }
  
  try {
    const { password } = req.body;
    const user = await User.findById(req.session.userId);
    
    if (!user.keySalt) {
      return res.status(400).json({ error: 'Sel de clé non trouvé. Veuillez régénérer vos clés.' });
    }
    
    console.log('Starting decryption process...');
    
    // Create key from password using PBKDF2 with stored salt
    const key = crypto.pbkdf2Sync(
      password,
      user.keySalt,
      100000,
      KEY_LENGTH,
      'sha512'
    );
    
    // Convert stored IV from hex to Buffer
    const iv = Buffer.from(user.iv, 'hex');
    
    // Decrypt the private key using password and IV
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let privateKey = decipher.update(user.encryptedPrivateKey, 'hex', 'utf8');
    privateKey += decipher.final('utf8');
    
    console.log('Private key decrypted successfully');
    
    // Path to the uploaded encrypted file
    const filePath = req.file.path;
    console.log('Encrypted file path:', filePath);
    
    // Read the encrypted file
    const encryptedData = fs.readFileSync(filePath);
    console.log('Encrypted file size:', encryptedData.length);
    
    // The last 256 bytes contain the encrypted AES key and IV
    const encryptedKey = encryptedData.slice(-256);
    const encryptedFileContent = encryptedData.slice(0, -256);
    console.log('Encrypted key size:', encryptedKey.length);
    console.log('Encrypted content size:', encryptedFileContent.length);
    
    // Decrypt the AES key and IV using private key with OAEP padding
    const decryptedKeyData = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256'
      },
      encryptedKey
    );
    
    console.log('AES key decrypted successfully');
    
    // Extract AES key and IV
    const aesKey = decryptedKeyData.slice(0, 32);
    const fileIv = decryptedKeyData.slice(32);
    console.log('AES key size:', aesKey.length);
    console.log('IV size:', fileIv.length);
    
    // Create AES decipher for file decryption
    const fileDecipher = crypto.createDecipheriv('aes-256-cbc', aesKey, fileIv);
    
    // Decrypt the file
    const decryptedFilePath = filePath.replace('.enc', '');
    console.log('Decrypted file path:', decryptedFilePath);
    
    // Process the encrypted content in chunks
    const chunkSize = 1024 * 1024; // 1MB chunks
    let decryptedData = Buffer.alloc(0);
    
    for (let i = 0; i < encryptedFileContent.length; i += chunkSize) {
      const chunk = encryptedFileContent.slice(i, i + chunkSize);
      const decryptedChunk = fileDecipher.update(chunk);
      if (decryptedChunk.length > 0) {
        decryptedData = Buffer.concat([decryptedData, decryptedChunk]);
      }
    }
    
    // Add the final chunk
    const finalChunk = fileDecipher.final();
    if (finalChunk.length > 0) {
      decryptedData = Buffer.concat([decryptedData, finalChunk]);
    }
    
    console.log('Final decrypted data size:', decryptedData.length);
    
    // Write the decrypted data to file
    fs.writeFileSync(decryptedFilePath, decryptedData);
    
    // Verify the decrypted file is not empty
    const stats = fs.statSync(decryptedFilePath);
    console.log('Decrypted file stats:', stats);
    
    if (stats.size === 0) {
      throw new Error('Decrypted file is empty');
    }
    
    res.json({
      success: true,
      decryptedFile: path.basename(decryptedFilePath),
      message: 'Fichier déchiffré avec succès'
    });
  } catch (error) {
    console.error('Erreur lors du déchiffrement du fichier:', error);
    if (req.file) {
      const decryptedFilePath = req.file.path.replace('.enc', '');
      if (fs.existsSync(decryptedFilePath)) {
        fs.unlinkSync(decryptedFilePath);
      }
    }
    res.status(500).json({ error: 'Erreur lors du déchiffrement du fichier. Veuillez vérifier votre mot de passe et vous assurer que ce fichier a été chiffré pour vous.' });
  }
});

app.get('/download/:file', (req, res) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  
  const filePath = path.join(__dirname, 'uploads', req.session.userId, req.params.file);
  res.download(filePath);
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});