const supabase = require('../config/supabase');
const ApiError = require('../utils/ApiError');

/**
 * Builds a small CRUD service bound to one table.
 * Kept generic so simple, uniformly-shaped resources (programs, achievements,
 * testimonials, faqs, announcements...) don't each need bespoke query code.
 */
const createCrudService = (table, { orderBy = 'display_order', ascending = true } = {}) => ({
  async list({ onlyActive = false } = {}) {
    let query = supabase.from(table).select('*');
    if (onlyActive) query = query.eq('status', 'active');
    if (orderBy) query = query.order(orderBy, { ascending });
    const { data, error } = await query;
    if (error) throw ApiError.internal(error.message);
    return data;
  },

  async getById(id) {
    const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
    if (error || !data) throw ApiError.notFound(`${table} record not found`);
    return data;
  },

  async create(payload) {
    const { data, error } = await supabase.from(table).insert(payload).select().single();
    if (error) throw ApiError.badRequest(error.message);
    return data;
  },

  async update(id, payload) {
    const { data, error } = await supabase.from(table).update(payload).eq('id', id).select().single();
    if (error) throw ApiError.badRequest(error.message);
    if (!data) throw ApiError.notFound(`${table} record not found`);
    return data;
  },

  async remove(id) {
    const { error } = await supabase.from(table).delete().eq('id', id);
    if (error) throw ApiError.badRequest(error.message);
    return { id };
  },
});

module.exports = createCrudService;
