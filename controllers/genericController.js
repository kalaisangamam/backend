const asyncHandler = require('../utils/asyncHandler');
const sendResponse = require('../utils/sendResponse');
const createCrudService = require('../services/crudService');

/**
 * Builds standard list/get/create/update/delete handlers for a table.
 * Public list endpoints only return status = 'active' rows; admin
 * endpoints (mounted behind requireRole('admin')) see everything.
 */
const createGenericController = (table, options) => {
  const service = createCrudService(table, options);

  return {
    listPublic: asyncHandler(async (req, res) => {
      const data = await service.list({ onlyActive: true });
      sendResponse(res, 200, data);
    }),
    listAdmin: asyncHandler(async (req, res) => {
      const data = await service.list({ onlyActive: false });
      sendResponse(res, 200, data);
    }),
    getOne: asyncHandler(async (req, res) => {
      const data = await service.getById(req.params.id);
      sendResponse(res, 200, data);
    }),
    create: asyncHandler(async (req, res) => {
      const data = await service.create(req.body);
      sendResponse(res, 201, data, 'Created successfully');
    }),
    update: asyncHandler(async (req, res) => {
      const data = await service.update(req.params.id, req.body);
      sendResponse(res, 200, data, 'Updated successfully');
    }),
    remove: asyncHandler(async (req, res) => {
      const data = await service.remove(req.params.id);
      sendResponse(res, 200, data, 'Deleted successfully');
    }),
    service,
  };
};

module.exports = createGenericController;
