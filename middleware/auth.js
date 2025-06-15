const ensureAuthenticatedUser = (req, res, next) => {
  if (req.session.isUserAuthenticated || req.session.isAdminAuthenticated) {
    return next();
  }
  req.flash('error', 'Please log in to view this page');
  res.redirect('/user/login');
};

const ensureAuthenticatedAdmin = (req, res, next) => {
  if (req.session.isAdminAuthenticated) {
    return next();
  }
  req.flash('error', 'Admin access required');
  res.redirect('/admin/login');
};

module.exports = { ensureAuthenticatedUser, ensureAuthenticatedAdmin };