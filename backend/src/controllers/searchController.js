import { routeQuery, OUT_OF_SCOPE_MESSAGE } from '../services/queryRouter.js';
import { orchestrateSearch } from '../services/searchOrchestrator.js';

export async function searchHandler(req, res, next) {
  try {
    const q = req.query.q;
    const routing = await routeQuery(q);

    if (routing.mode === 'unsupported') {
      return res.json({
        mode: 'unsupported',
        intent_type: 'out_of_scope',
        result_type: 'empty_with_fallback',
        items: [],
        message: OUT_OF_SCOPE_MESSAGE,
      });
    }

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

    const result = await orchestrateSearch({ query: q, routing, filters });

    if (routing.mode === 'degraded') {
      res.set('X-Search-Degraded', 'true');
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}
