const express = require('express');
const router = express.Router();
const User = require('../models/User');
const OTP = require('../models/OTP');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

router.get('/register', (req, res) => {
  res.render('user-register', { messages: req.flash('error'), session: req.session });
});

router.post('/register', async (req, res) => {
  const { email, password, username } = req.body;
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    req.flash('error', 'Email already registered');
    return res.redirect('/user/register');
  }
  const existingUsername = await User.findOne({ username });
  if (existingUsername) {
    req.flash('error', 'Username already taken');
    return res.redirect('/user/register');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await OTP.create({ email, otp });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Verify Your AniFusionstream Account with OTP',
    text: `Dear ${username},\n\nThe One Time Password (OTP) to verify your Email Address for AniFusionstream registration is ${otp}. It will expire in 5 minutes. Please do not share this code with anyone.\n\nRegards,\nAniFusionstream`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) {
      console.error('Error sending OTP:', error);
      req.flash('error', 'Error sending OTP');
      return res.redirect('/user/register');
    }
    req.session.tempUser = { email, password, username };
    res.redirect('/user/verify-otp');
  });
});

router.get('/verify-otp', (req, res) => {
  if (!req.session.tempUser) {
    return res.redirect('/user/register');
  }
  res.render('user-verify-otp', { messages: req.flash('error'), session: req.session });
});

router.post('/verify-otp', async (req, res) => {
  const { otp } = req.body;
  const tempUser = req.session.tempUser;
  if (!tempUser) {
    return res.redirect('/user/register');
  }

  const otpRecord = await OTP.findOne({ email: tempUser.email, otp });
  if (!otpRecord) {
    req.flash('error', 'Invalid or expired OTP');
    return res.redirect('/user/verify-otp');
  }

  const hashedPassword = await bcrypt.hash(tempUser.password, 10);
  const user = await User.create({ email: tempUser.email, password: hashedPassword, username: tempUser.username });
  delete req.session.tempUser;
  await OTP.deleteOne({ email: tempUser.email, otp });
  req.session.user = user;
  req.session.isUserAuthenticated = true;
  res.redirect('/user/login');
});

router.get('/login', (req, res) => {
  res.render('user-login', { messages: req.flash('error'), session: req.session });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    req.flash('error', 'Invalid credentials');
    return res.redirect('/user/login');
  }
  req.session.user = user;
  req.session.isUserAuthenticated = true;
  res.redirect('/');
});

router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/user/login');
  });
});

router.get('/forgot-password', (req, res) => {
  res.render('user-forgot-password', { messages: req.flash('error'), session: req.session });
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    req.flash('error', 'Email not found');
    return res.redirect('/user/forgot-password');
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  await OTP.create({ email, otp });

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'Reset Your AniFusionstream Password with OTP',
    text: `Dear ${user.username},\n\nThe One Time Password (OTP) to reset your password for AniFusionstream is ${otp}. It will expire in 5 minutes. Please do not share this code with anyone.\n\nRegards,\nAniFusionstream`
  };

  transporter.sendMail(mailOptions, (error) => {
    if (error) {
      console.error('Error sending OTP for password reset:', error);
      req.flash('error', 'Error sending OTP');
      return res.redirect('/user/forgot-password');
    }
    req.session.resetEmail = email;
    res.redirect('/user/reset-password');
  });
});

router.get('/reset-password', (req, res) => {
  if (!req.session.resetEmail) {
    return res.redirect('/user/forgot-password');
  }
  res.render('user-reset-password', { messages: req.flash('error'), session: req.session });
});

router.post('/reset-password', async (req, res) => {
  const { otp, newPassword } = req.body;
  const email = req.session.resetEmail;
  if (!email) {
    return res.redirect('/user/forgot-password');
  }

  const otpRecord = await OTP.findOne({ email, otp });
  if (!otpRecord) {
    req.flash('error', 'Invalid or expired OTP');
    return res.redirect('/user/reset-password');
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await User.findOneAndUpdate({ email }, { password: hashedPassword });
  delete req.session.resetEmail;
  await OTP.deleteOne({ email, otp });
  res.redirect('/user/login');
});

module.exports = router;