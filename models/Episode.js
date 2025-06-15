const mongoose = require('mongoose');

const episodeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  videoUrl: { type: String, required: false },
  embedCode: { type: String, required: false },
  episodeNumber: { type: Number, required: true },
  seasonNumber: { type: Number, required: true }
});

module.exports = mongoose.model('Episode', episodeSchema);