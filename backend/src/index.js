const { app } = require("./server");

const port = process.env.PORT || 3000;
app.listen(port, () => {
  // Keep startup output simple for local dev.
  console.log(`API listening on http://localhost:${port}`);
});
