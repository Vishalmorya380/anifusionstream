const express = require('express');
const router = express.Router();

// DMCA Page
router.get('/dmca', (req, res) => {
  res.render('dmca', { session: req.session });
});

// Privacy Policy Page
router.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy', { session: req.session });
});

// Contact Us Page
router.get('/contact-us', (req, res) => {
  res.render('contact-us', { session: req.session });
});

module.exports = router;