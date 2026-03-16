import express from "express";
import { climaController } from "../../../../controllers/climaController.js";

const router = express.Router();

export default function () {
  router.get("/", (req, res) => res.json({ status: "ok public" }));
  router.get("/clima", climaController);
  return router;
}
