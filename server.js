require('dotenv').config();  // Load environment variables
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const ChatHistory = require('./models/ChatHistory');
const app = express();

// Use CORS with restricted access (replace with your frontend URL)
const allowedOrigins = ['http://localhost:3000', 'https://yourfrontendurl.com','https://f6fc-34-87-125-115.ngrok-free.app'];
app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true); // Allow the request
    } else {
      callback(new Error('Not allowed by CORS')); // Block the request
    }
  },
}));

// Middleware to parse JSON data
app.use(express.json());

// MongoDB connection with environment variable for MongoDB URI
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);  // Exit the process in case of failure
  });

// API route to store question and answer
app.post('/storeChat', async (req, res) => {
  const { question, answer } = req.body;

  try {
    const chatEntry = new ChatHistory({ question, answer });
    await chatEntry.save();
    res.status(200).json({ message: 'Chat history saved successfully.' });
  } catch (error) {
    console.error('Error saving chat history:', error);
    res.status(500).json({ error: 'Failed to save chat history.' });
  }
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
