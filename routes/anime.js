const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const Episode = require('../models/Episode');
const Comment = require('../models/Comment');
const { ensureAuthenticatedUser, ensureAuthenticatedAdmin } = require('../middleware/auth');
const mongoose = require('mongoose');

// View Anime Details
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).render('error', { message: 'Invalid anime ID', session: req.session });
  }

  const anime = await Anime.findById(id)
    .populate('genres')
    .populate({
      path: 'seasons.episodes',
      model: 'Episode'
    });

  if (!anime) {
    return res.status(404).render('error', { message: 'Anime not found', session: req.session });
  }

  const comments = await Comment.find({ anime: id, parentComment: null })
    .populate('user')
    .populate({
      path: 'replies',
      populate: { path: 'user' }
    });

  res.render('anime-detail', { anime, comments, session: req.session });
});

// Delete Episode
router.post('/delete-episode/:animeId/:seasonId/:episodeId', ensureAuthenticatedAdmin, async (req, res) => {
  const { animeId, seasonId, episodeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(animeId) || !mongoose.Types.ObjectId.isValid(seasonId) || !mongoose.Types.ObjectId.isValid(episodeId)) {
    return res.status(400).render('error', { message: 'Invalid ID', session: req.session });
  }

  const anime = await Anime.findById(animeId);
  if (!anime) {
    return res.status(404).render('error', { message: 'Anime not found', session: req.session });
  }

  const season = anime.seasons.id(seasonId);
  if (!season) {
    return res.status(404).render('error', { message: 'Season not found', session: req.session });
  }

  season.episodes = season.episodes.filter(ep => ep._id.toString() !== episodeId);
  await anime.save();

  res.redirect(`/anime/${animeId}`);
});

// Edit Episode Page
router.get('/edit-episode/:animeId/:seasonId/:episodeId', ensureAuthenticatedAdmin, async (req, res) => {
  const { animeId, seasonId, episodeId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(animeId) || !mongoose.Types.ObjectId.isValid(seasonId) || !mongoose.Types.ObjectId.isValid(episodeId)) {
    return res.status(400).render('error', { message: 'Invalid ID', session: req.session });
  }

  const anime = await Anime.findById(animeId);
  if (!anime) {
    return res.status(404).render('error', { message: 'Anime not found', session: req.session });
  }

  const season = anime.seasons.id(seasonId);
  if (!season) {
    return res.status(404).render('error', { message: 'Season not found', session: req.session });
  }

  const episode = await Episode.findById(episodeId);
  if (!episode) {
    return res.status(404).render('error', { message: 'Episode not found', session: req.session });
  }

  res.render('admin-edit-episode', { anime, season, episode, session: req.session, messages: req.flash() });
});

// Edit Episode Handler
router.post('/edit-episode/:animeId/:seasonId/:episodeId', ensureAuthenticatedAdmin, async (req, res) => {
  const { animeId, seasonId, episodeId } = req.params;
  const { episodeNumber, title, videoUrl, embedCode } = req.body;

  if (!mongoose.Types.ObjectId.isValid(animeId) || !mongoose.Types.ObjectId.isValid(seasonId) || !mongoose.Types.ObjectId.isValid(episodeId)) {
    req.flash('error', 'Invalid ID');
    return res.redirect(`/anime/${animeId}`);
  }

  const episodeNum = Number(episodeNumber);
  if (!episodeNumber || isNaN(episodeNum) || episodeNum <= 0) {
    req.flash('error', 'Valid episode number (positive integer) is required.');
    return res.redirect(`/anime/edit-episode/${animeId}/${seasonId}/${episodeId}`);
  }
  if (!title || title.trim() === '') {
    req.flash('error', 'Episode title is required.');
    return res.redirect(`/anime/edit-episode/${animeId}/${seasonId}/${episodeId}`);
  }
  if (!videoUrl && !embedCode) {
    req.flash('error', 'At least one of video URL or embed code is required.');
    return res.redirect(`/anime/edit-episode/${animeId}/${seasonId}/${episodeId}`);
  }

  try {
    let finalEmbedCode = embedCode?.trim() || '';
    if (videoUrl && !finalEmbedCode) {
      finalEmbedCode = `<iframe src="${videoUrl.trim()}" style="border:0;height:360px;width:640px;max-width:100%" allowFullScreen="true" allowtransparency allow="autoplay" scrolling="no" frameborder="0"></iframe>`;
    }

    await Episode.findByIdAndUpdate(episodeId, {
      episodeNumber: episodeNum,
      title: title.trim(),
      videoUrl: videoUrl?.trim() || '',
      embedCode: finalEmbedCode
    });

    req.flash('success', 'Episode updated successfully.');
    res.redirect(`/anime/${animeId}`);
  } catch (error) {
    console.error('Error updating episode:', error);
    req.flash('error', 'Error updating episode: ' + error.message);
    res.redirect(`/anime/edit-episode/${animeId}/${seasonId}/${episodeId}`);
  }
});

// Add Comment Handler
router.post('/comment/:animeId', async (req, res) => {
  const { animeId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(animeId)) {
    return res.status(400).render('error', { message: 'Invalid anime ID', session: req.session });
  }

  if (!content || content.trim() === '') {
    req.flash('error', 'Comment content is required.');
    return res.redirect(`/anime/${animeId}`);
  }

  if (!req.session.user && !req.session.isAdminAuthenticated) {
    req.flash('error', 'Please log in to comment.');
    return res.redirect('/user/login');
  }

  try {
    const comment = new Comment({
      anime: animeId,
      user: req.session.user ? req.session.user._id : null,
      username: req.session.isAdminAuthenticated ? 'AnimeFusionStream' : (req.session.user ? req.session.user.username : ''),
      email: req.session.user ? req.session.user.email : '',
      isAdmin: req.session.isAdminAuthenticated || false,
      content: content.trim()
    });
    await comment.save();
    res.redirect(`/anime/${animeId}`);
  } catch (error) {
    console.error('Error adding comment:', error);
    req.flash('error', 'Error adding comment: ' + error.message);
    res.redirect(`/anime/${animeId}`);
  }
});

// Reply to Comment Handler
router.post('/comment/reply/:animeId/:commentId', async (req, res) => {
  const { animeId, commentId } = req.params;
  const { content } = req.body;

  if (!mongoose.Types.ObjectId.isValid(animeId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    return res.status(400).render('error', { message: 'Invalid ID', session: req.session });
  }

  if (!content || content.trim() === '') {
    req.flash('error', 'Reply content is required.');
    return res.redirect(`/anime/${animeId}`);
  }

  if (!req.session.user && !req.session.isAdminAuthenticated) {
    req.flash('error', 'Please log in to reply.');
    return res.redirect('/user/login');
  }

  try {
    const parentComment = await Comment.findById(commentId);
    if (!parentComment) {
      req.flash('error', 'Comment not found.');
      return res.redirect(`/anime/${animeId}`);
    }

    const reply = new Comment({
      anime: animeId,
      user: req.session.user ? req.session.user._id : null,
      username: req.session.isAdminAuthenticated ? 'AnimeFusionStream' : (req.session.user ? req.session.user.username : ''),
      email: req.session.user ? req.session.user.email : '',
      isAdmin: req.session.isAdminAuthenticated || false,
      content: content.trim(),
      parentComment: commentId
    });
    await reply.save();

    parentComment.replies.push(reply._id);
    await parentComment.save();

    res.redirect(`/anime/${animeId}`);
  } catch (error) {
    console.error('Error adding reply:', error);
    req.flash('error', 'Error adding reply: ' + error.message);
    res.redirect(`/anime/${animeId}`);
  }
});

// Delete Comment Handler
router.post('/comment/delete/:animeId/:commentId', async (req, res) => {
  const { animeId, commentId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(animeId) || !mongoose.Types.ObjectId.isValid(commentId)) {
    return res.status(400).render('error', { message: 'Invalid ID', session: req.session });
  }

  if (!req.session.user && !req.session.isAdminAuthenticated) {
    req.flash('error', 'Please log in to delete comments.');
    return res.redirect('/user/login');
  }

  try {
    const comment = await Comment.findById(commentId).populate('user');
    if (!comment) {
      req.flash('error', 'Comment not found.');
      return res.redirect(`/anime/${animeId}`);
    }

    const isAdmin = req.session.isAdminAuthenticated || false;
    const isOwner = req.session.user && comment.user && comment.user._id.toString() === req.session.user._id.toString();

    if (!isOwner && !isAdmin) {
      req.flash('error', 'You can only delete your own comments unless you are an admin.');
      return res.redirect(`/anime/${animeId}`);
    }

    const deleteReplies = async (commentId) => {
      const replies = await Comment.find({ parentComment: commentId });
      for (const reply of replies) {
        await deleteReplies(reply._id);
        await Comment.findByIdAndDelete(reply._id);
      }
    };

    await deleteReplies(commentId);

    if (comment.parentComment) {
      const parentComment = await Comment.findById(comment.parentComment);
      if (parentComment) {
        parentComment.replies = parentComment.replies.filter(replyId => replyId.toString() !== commentId);
        await parentComment.save();
      }
    }

    await Comment.findByIdAndDelete(commentId);
    res.redirect(`/anime/${animeId}`);
  } catch (error) {
    console.error('Error deleting comment:', error);
    req.flash('error', 'Error deleting comment: ' + error.message);
    res.redirect(`/anime/${animeId}`);
  }
});

module.exports = router;