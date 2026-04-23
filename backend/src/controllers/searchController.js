import { classifyQuery } from '../services/intentClassifier.js';
import { orchestrateSearch } from '../services/searchOrchestrator.js';

export async function searchHandler(req, res, next) {
  try {
    const q = req.query.q;
    const { tier } = await classifyQuery(q);

    const cinemaIds = req.query.cinema_ids
      ? req.query.cinema_ids.split(',').map(Number).filter(Number.isFinite)
      : [];

    const filters = {
      date: req.query.date || null,
      from: req.query.from || null,
      to: req.query.to || null,
      cinemaIds,
      sort: req.query.sort || 'relevance',
      limit: req.query.limit || 20,
      offset: req.query.offset || 0,
    };

    const result = await orchestrateSearch({ query: q, tier, filters });

    res.json(result);
  } catch (err) {
    next(err);
  }
}
