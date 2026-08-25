const supabase = require('../config/supabase');
const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');

// GET /api/dashboard/overview (admin)
const getOverview = asyncHandler(async (req, res) => {
  const count = (table, filters = {}) => {
    let query = supabase.from(table).select('id', { count: 'exact', head: true });
    Object.entries(filters).forEach(([k, v]) => {
      query = query.eq(k, v);
    });
    return query;
  };

  const [
    totalStudents,
    activeStudents,
    totalMasters,
    upcomingEvents,
    pendingFees,
    galleryItems,
  ] = await Promise.all([
    count('students'),
    count('students', { status: 'active' }),
    count('masters', { status: 'active' }),
    count('events', { status: 'active' }),
    count('fees', { status: 'pending' }),
    count('gallery', { status: 'active' }),
  ]);

  sendResponse(res, 200, {
    totalStudents: totalStudents.count || 0,
    activeStudents: activeStudents.count || 0,
    totalMasters: totalMasters.count || 0,
    upcomingEvents: upcomingEvents.count || 0,
    pendingFees: pendingFees.count || 0,
    galleryItems: galleryItems.count || 0,
  });
});

module.exports = { getOverview };
