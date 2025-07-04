const express = require('express');
const router = express.Router();
const Anime = require('../models/Anime');
const Genre = require('../models/Genre');
const Episode = require('../models/Episode');
const { ensureAuthenticatedUser } = require('../middleware/auth');

// Home Route
router.get('/', ensureAuthenticatedUser, async (req, res) => {
  try {
    const searchQuery = req.query.q || '';
    const selectedGenre = req.query.genre || '';

    // Fetch all genres
    const genres = await Genre.find();

    // Build the query for animes
    let animeQuery = {};

    // If there's a search query, try to find an exact match
    if (searchQuery) {
      const anime = await Anime.findOne({ name: new RegExp('^' + searchQuery + '$', 'i') }).populate('genres');
      if (anime) {
        return res.redirect(`/anime/${anime._id}`);
      }
      animeQuery.name = { $regex: searchQuery, $options: 'i' };
    }

    // Filter by genre if selected
    if (selectedGenre) {
      animeQuery.genres = selectedGenre;
    }

    // Fetch animes with the applied filters
    let animes = await Anime.find(animeQuery)
      .populate('genres')
      .populate({
        path: 'seasons.episodes',
        model: 'Episode'
      });

    // Fetch 25 latest episodes from all anime (like anime-details.ejs)
    let allEpisodes = [];
    animes.forEach(anime => {
      anime.seasons.forEach(season => {
        (season.episodes || []).forEach(episode => {
          if (episode) {
            allEpisodes.push({
              ...episode._doc,
              anime: anime,
              seasonNumber: season.seasonNumber
            });
          }
        });
      });
    });
    allEpisodes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const latestEpisodes = allEpisodes.slice(0, 25);

    // Reorder genres: selected genre at the top
    let sortedGenres = [...genres];
    if (selectedGenre) {
      const selectedGenreIndex = sortedGenres.findIndex(g => g._id.toString() === selectedGenre);
      if (selectedGenreIndex !== -1) {
        const [selected] = sortedGenres.splice(selectedGenreIndex, 1);
        sortedGenres.unshift(selected);
      }
    }

    res.render('index', {
      animes,
      genres: sortedGenres,
      searchQuery,
      selectedGenre,
      session: req.session,
      messages: req.flash(),
      isSearchResult: !!searchQuery || !!selectedGenre,
      latestEpisodes
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'An error occurred while loading the homepage');
    res.render('index', {
      animes: [],
      genres: [],
      searchQuery: req.query.q || '',
      selectedGenre: req.query.genre || '',
      session: req.session,
      messages: req.flash(),
      isSearchResult: false,
      latestEpisodes: []
    });
  }
});

// Search Route (Redirects to root with query params)
router.get('/search', ensureAuthenticatedUser, async (req, res) => {
  const { q, genre } = req.query;
  res.redirect(`/?q=${encodeURIComponent(q || '')}&genre=${encodeURIComponent(genre || '')}`);
});

module.exports = router;