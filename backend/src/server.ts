import express from "express";

const app = express();
const PORT = 3000;

app.use(express.json());

app.get("/", (req, res) => {
  res.json(
    {
      message: "Nova backend is running"
    }
  );
});

app.listen(PORT, () => {
  console.log(`Nova backend running on http://localhost:${PORT}`);
})