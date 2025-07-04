const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const Episode = require('../models/Episode');
const Genre = require('../models/Genre');
const Admin = require('../models/Admin');
const bcrypt = require('bcryptjs');
const { ensureAuthenticatedAdmin } = require('../middleware/auth');
const mongoose = require('mongoose');

// Admin login page
router.get('/login', (req, res) => {
  res.render('admin-login', { messages: req.flash(), session: req.session });
});

// Admin login handler
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username });
  if (!admin || !(await bcrypt.compare(password, admin.password))) {
    req.flash('error', 'Invalid credentials');
    return res.redirect('/admin/login');
  }
  req.session.isAdminAuthenticated = true;
  req.session.adminUsername = 'AnimeFusionStream'; // Store admin username for comments
  res.redirect('/admin/dashboard');
});

// Admin registration page
router.get('/register', (req, res) => {
  res.render('admin-register', { messages: req.flash(), session: req.session });
});

// Admin registration handler
router.post('/register', async (req, res) => {
  const { username, password, adminCode } = req.body;
  if (adminCode !== process.env.ADMIN_CODE) {
    req.flash('error', 'Invalid admin code');
    return res.redirect('/admin/register');
  }
  const existingAdmin = await Admin.findOne({ username });
  if (existingAdmin) {
    req.flash('error', 'Username already exists');
    return res.redirect('/admin/register');
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  await Admin.create({ username, password: hashedPassword });
  res.redirect('/admin/login');
});

// Forgot password page
router.get('/forgot-password', (req, res) => {
  res.render('admin-forgot-password', { messages: req.flash(), session: req.session });
});

// Forgot password handler
router.post('/forgot-password', async (req, res) => {
  const { username, adminCode } = req.body;
  if (adminCode !== process.env.ADMIN_CODE) {
    req.flash('error', 'Invalid admin code');
    return res.redirect('/admin/forgot-password');
  }
  const admin = await Admin.findOne({ username });
  if (!admin) {
    req.flash('error', 'Admin not found');
    return res.redirect('/admin/forgot-password');
  }
  req.session.adminResetUsername = username;
  res.redirect('/admin/reset-password');
});

// Reset password page
router.get('/reset-password', (req, res) => {
  if (!req.session.adminResetUsername) {
    return res.redirect('/admin/forgot-password');
  }
  res.render('admin-reset-password', { messages: req.flash(), session: req.session });
});

// Reset password handler
router.post('/reset-password', async (req, res) => {
  const { password } = req.body;
  const username = req.session.adminResetUsername;
  if (!username) {
    return res.redirect('/admin/forgot-password');
  }
  if (!password || typeof password !== 'string' || password.trim().length === 0) {
    req.flash('error', 'Password is required');
    return res.redirect('/admin/reset-password');
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  await Admin.findOneAndUpdate({ username }, { password: hashedPassword });
  delete req.session.adminResetUsername;
  req.flash('success', 'Password reset successful. Please log in.');
  res.redirect('/admin/login');
});

// Admin dashboard
router.get('/dashboard', ensureAuthenticatedAdmin, async (req, res) => {
  const animes = await Anime.find()
    .populate('genres')
    .populate({
      path: 'seasons.episodes',
      model: 'Episode'
    });
  res.render('admin-dashboard', { animes, session: req.session });
});

// Add anime page
router.get('/add-anime', ensureAuthenticatedAdmin, async (req, res) => {
  const genres = await Genre.find();
  res.render('admin-add-anime', { genres, session: req.session });
});

// Add anime handler
router.post('/add-anime', ensureAuthenticatedAdmin, async (req, res) => {
  const { name, imageUrl, description, genres } = req.body;
  const anime = new Anime({
    name,
    imageUrl,
    description,
    genres: Array.isArray(genres) ? genres : (genres ? [genres] : [])
  });
  await anime.save();
  res.redirect('/admin/dashboard');
});

// Edit anime page
router.get('/edit-anime/:id', ensureAuthenticatedAdmin, async (req, res) => {
  const anime = await Anime.findById(req.params.id).populate('genres');
  const genres = await Genre.find();
  if (!anime) {
    req.flash('error', 'Anime not found');
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-edit-anime', { anime, genres, session: req.session });
});

// Edit anime handler
router.post('/edit-anime/:id', ensureAuthenticatedAdmin, async (req, res) => {
  const { name, imageUrl, description, genres } = req.body;
  await Anime.findByIdAndUpdate(req.params.id, {
    name,
    imageUrl,
    description,
    genres: Array.isArray(genres) ? genres : (genres ? [genres] : [])
  });
  res.redirect('/admin/dashboard');
});

// Delete anime handler
router.post('/delete-anime/:id', ensureAuthenticatedAdmin, async (req, res) => {
  await Anime.findByIdAndDelete(req.params.id);
  res.redirect('/admin/dashboard');
});

// Add episode page
router.get('/add-episode/:animeId', ensureAuthenticatedAdmin, async (req, res) => {
  const anime = await Anime.findById(req.params.animeId);
  if (!anime) {
    req.flash('error', 'Anime not found');
    return res.redirect('/admin/dashboard');
  }
  res.render('admin-add-episode', { anime, session: req.session, messages: req.flash() });
});

// Add episode handler
router.post('/add-episode/:animeId', ensureAuthenticatedAdmin, async (req, res) => {
  const { seasonNumber, episodeNumber, title, videoUrl, embedCode } = req.body;

  console.log('Episode form submission:', req.body);

  // Validation and conversion
  const seasonNum = Number(seasonNumber);
  const episodeNum = Number(episodeNumber);

  if (!seasonNumber || isNaN(seasonNum) || seasonNum <= 0) {
    req.flash('error', 'Valid season number (positive integer) is required.');
    return res.redirect(`/admin/add-episode/${req.params.animeId}`);
  }
  if (!episodeNumber || isNaN(episodeNum) || episodeNum <= 0) {
    req.flash('error', 'Valid episode number (positive integer) is required.');
    return res.redirect(`/admin/add-episode/${req.params.animeId}`);
  }
  if (!title || title.trim() === '') {
    req.flash('error', 'Episode title is required.');
    return res.redirect(`/admin/add-episode/${req.params.animeId}`);
  }
  if (!videoUrl && !embedCode) {
    req.flash('error', 'At least one of video URL or embed code is required.');
    return res.redirect(`/admin/add-episode/${req.params.animeId}`);
  }

  try {
    // Generate embedCode from videoUrl if provided and embedCode is not provided
    let finalEmbedCode = embedCode?.trim() || '';
    if (videoUrl && !finalEmbedCode) {
      finalEmbedCode = `<iframe src="${videoUrl.trim()}" style="border:0;height:360px;width:640px;max-width:100%" allowFullScreen="true" allowtransparency allow="autoplay" scrolling="no" frameborder="0"></iframe>`;
    }

    // Create new episode
    const episode = new Episode({
      title: title.trim(),
      videoUrl: videoUrl?.trim() || '',
      embedCode: finalEmbedCode,
      episodeNumber: episodeNum,
      seasonNumber: seasonNum
    });
    await episode.save();

    // Find anime and update seasons
    const anime = await Anime.findById(req.params.animeId);
    if (!anime) {
      req.flash('error', 'Anime not found');
      return res.redirect('/admin/dashboard');
    }

    // Find existing season or create new season
    let season = anime.seasons.find(s => s.seasonNumber === seasonNum);
    if (season) {
      season.episodes.push(episode._id);
    } else {
      anime.seasons.push({ seasonNumber: seasonNum, episodes: [episode._id] });
    }

    await anime.save();

    req.flash('success', 'Episode added successfully.');
    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error('Error saving episode:', error);
    req.flash('error', 'Error adding episode: ' + error.message);
    res.redirect(`/admin/add-episode/${req.params.animeId}`);
  }
});

// Delete episode handler
router.post('/delete-episode/:animeId/:seasonId/:episodeId', ensureAuthenticatedAdmin, async (req, res) => {
  const { animeId, seasonId, episodeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(animeId) ||
      !mongoose.Types.ObjectId.isValid(seasonId) ||
      !mongoose.Types.ObjectId.isValid(episodeId)) {
    req.flash('error', 'Invalid ID');
    return res.redirect('/admin/dashboard');
  }

  const anime = await Anime.findById(animeId);
  if (!anime) {
    req.flash('error', 'Anime not found');
    return res.redirect('/admin/dashboard');
  }

  const season = anime.seasons.id(seasonId);
  if (!season) {
    req.flash('error', 'Season not found');
    return res.redirect('/admin/dashboard');
  }

  season.episodes = season.episodes.filter(ep => ep.toString() !== episodeId);
  await anime.save();

  req.flash('success', 'Episode deleted successfully');
  res.redirect('/admin/dashboard');
});

// Manage categories page
router.get('/manage-categories', ensureAuthenticatedAdmin, async (req, res) => {
  const genres = await Genre.find();
  res.render('admin-manage-categories', { genres, session: req.session });
});

// Add genre handler
router.post('/add-genre', ensureAuthenticatedAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    req.flash('error', 'Genre name cannot be empty');
    return res.redirect('/admin/manage-categories');
  }
  const genre = new Genre({ name: name.trim() });
  await genre.save();
  res.redirect('/admin/manage-categories');
});

// Edit genre handler
router.post('/edit-genre/:id', ensureAuthenticatedAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || name.trim() === '') {
    req.flash('error', 'Genre name cannot be empty');
    return res.redirect('/admin/manage-categories');
  }
  await Genre.findByIdAndUpdate(req.params.id, { name: name.trim() });
  res.redirect('/admin/manage-categories');
});

// Delete genre handler
router.post('/delete-genre/:id', ensureAuthenticatedAdmin, async (req, res) => {
  await Genre.findByIdAndDelete(req.params.id);
  res.redirect('/admin/manage-categories');
});

// Admin logout
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

module.exports = router;