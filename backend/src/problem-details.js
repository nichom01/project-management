function createProblem({ type, title, status, detail, instance }) {
  return {
    type,
    title,
    status,
    detail,
    instance,
  };
}

function appError({ type, title, status, detail }) {
  const error = new Error(detail || title);
  error.problem = { type, title, status, detail };
  return error;
}

function problemDetailsMiddleware(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }
  const p = err.problem || {
    type: "https://project-management/errors/internal",
    title: "Internal Server Error",
    status: 500,
    detail: "Unexpected server error",
  };
  return res.status(p.status).json(
    createProblem({
      ...p,
      instance: req.path,
    }),
  );
}

module.exports = {
  createProblem,
  appError,
  problemDetailsMiddleware,
};
