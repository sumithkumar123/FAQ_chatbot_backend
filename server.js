// Backend (Node.js/Express - index.js)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const natural = require('natural');
const axios = require('axios');
const app = express();

const allowedOrigins = ['http://localhost:3000', 'https://yourfrontendurl.com']; // Replace with your frontend URL
app.use(cors({
  origin: (origin, callback) => {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));

app.use(express.json());

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch((error) => {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  });

const chatHistorySchema = new mongoose.Schema({
  question: { type: String, required: true },
  normalizedQuestion: { type: String, required: true },
  answer: { type: String, required: true },
  feedback: { type: String, enum: ['thumbsUp', 'thumbsDown', 'neutral'], default: 'neutral' },
  thumbsUp: { type: Number, default: 0 },
  thumbsDown: { type: Number, default: 0 },
  category: { type: String, default: 'other' },
  timestamp: { type: Date, default: Date.now },
  count: { type: Number, default: 0 },
});

const ChatHistory = mongoose.model('ChatHistory', chatHistorySchema);

// Normalize question function
function normalizeQuestion(question) {
  const tokenizer = new natural.WordTokenizer();
  const words = tokenizer.tokenize(question.toLowerCase());
  const stemmedWords = words.map((word) => natural.PorterStemmer.stem(word));
  return stemmedWords.join(' ');
}

app.post('/process_question', async (req, res) => {
  const { question } = req.body;

  try {
    const normalizedQuestion = normalizeQuestion(question);

    let existingChat = await ChatHistory.findOne({ normalizedQuestion });

    if (existingChat) {
      existingChat.count += 1;
      await existingChat.save();

      return res.status(200).json({ answer: existingChat.answer, _id: existingChat._id });

    } else {
      const apiResponse = await axios.post('https://5285-34-168-84-38.ngrok-free.app/process_question', { question }); // Replace with your Flask app URL
      const answer = apiResponse.data.answer;

      const newChatEntry = new ChatHistory({ question, normalizedQuestion, answer, count: 1 });
      await newChatEntry.save();

      return res.status(200).json({ answer, _id: newChatEntry._id });
    }
  } catch (error) {
    console.error('Error processing question:', error);
    res.status(500).json({ error: 'Failed to process the question.' });
  }
});

app.post('/storeChat', async (req, res) => {
  try {
    const { question, category, answer, feedback } = req.body;
    const normalizedQuestion = normalizeQuestion(question);

    let chatEntry = await ChatHistory.findOne({ normalizedQuestion });

    if (chatEntry) {
      if (question.toLowerCase().includes(category.toLowerCase())) {
        chatEntry.category = category;
      } else {
        chatEntry.category = 'other';
      }

      if (feedback === 'thumbsUp') {
        chatEntry.thumbsUp += 1;
      } else if (feedback === 'thumbsDown') {
        chatEntry.thumbsDown += 1;
      }

      await chatEntry.save();
      return res.status(200).json({ _id: chatEntry._id, message: 'Chat updated' });
    } else {
      chatEntry = new ChatHistory({
        question,
        normalizedQuestion,
        category: question.toLowerCase().includes(category.toLowerCase()) ? category : 'other',
        answer,
        feedback,
        count: 1,
      });
      const savedMessage = await chatEntry.save();
      res.status(200).json({ _id: savedMessage._id, message: 'Chat history saved.' });
    }
  } catch (error) {
    console.error('Error saving chat history:', error);
    res.status(500).json({ error: 'Failed to save chat history.' });
  }
});

// /faqs route:
app.get('/faqs', async (req, res) => {
  const { category } = req.query;

  try {
    let query = {};
    if (category && category !== 'faqs') {
      query = { category };
    }

    let faqs;
    if (category === 'faqs') {
      // Find top 5 questions from 'other' category
      const otherFaqs = await ChatHistory.aggregate([
        { $match: { category: 'other' } },
        { $group: { _id: '$normalizedQuestion', count: { $sum: '$count' }, question: { $first: '$question' }, answer: { $first: '$answer' }, category: { $first: '$category' } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]);

      // Find top 5 questions from all categories excluding 'other'
      const nonOtherFaqs = await ChatHistory.aggregate([
        { $match: { category: { $ne: 'other' } } },
        { $group: { _id: '$normalizedQuestion', count: { $sum: '$count' }, question: { $first: '$question' }, answer: { $first: '$answer' }, category: { $first: '$category' } } },
        { $sort: { count: -1 } },
        { $limit: 5 },
      ]);

      // Combine the results, sort by count, and take top 5
      faqs = [...otherFaqs, ...nonOtherFaqs]
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    } else {
      // Regular query for other categories
      faqs = await ChatHistory.find(query).sort({ thumbsUp: -1 }).limit(5);
    }

    res.status(200).json(faqs);
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    res.status(500).json({ error: 'Failed to fetch FAQs.' });
  }
});

app.put('/updateFeedback/:id', async (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body;

  try {
    const chat = await ChatHistory.findById(id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found.' });
    }

    if (feedback === 'thumbsUp') {
      chat.feedback = 'thumbsUp';
      chat.thumbsUp += 1;
    } else if (feedback === 'thumbsDown') {
      chat.feedback = 'thumbsDown';
      chat.thumbsDown += 1;
    } else {
      chat.feedback = 'neutral';
    }

    await chat.save();

    res.status(200).json({ message: 'Feedback updated successfully.', chat });
  } catch (error) {
    console.error('Error updating feedback:', error);
    res.status(500).json({ error: 'Failed to update feedback.' });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
