const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const genreSchema = new Schema({
  name: { type: String, required: true }
});

// Export the model, ensuring it’s only compiled once
module.exports = mongoose.models.Genre || mongoose.model('Genre', genreSchema);