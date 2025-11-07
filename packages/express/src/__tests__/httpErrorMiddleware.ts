import express from "express";
import { isHttpError } from "http-errors";

export const httpErrorMiddleware: express.ErrorRequestHandler = (
  err,
  _req,
  res,
  next,
) => {
  if (isHttpError(err) && !res.headersSent) {
    const { status, message } = err;
    const details: unknown = err.details;
    res.status(status).send({
      error: { message, details },
    });
    return;
  }
  next(err);
};
