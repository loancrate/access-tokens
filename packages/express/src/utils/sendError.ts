import express from "express";

export function sendError(
  res: express.Response,
  status: number,
  message: string,
  extra?: Record<string, unknown>,
): void {
  res.status(status).json({ error: { message, ...extra } });
}
