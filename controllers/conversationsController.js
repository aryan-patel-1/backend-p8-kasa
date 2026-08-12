const {
  listConversations,
  getConversationById,
  getOrCreateConversation,
  addMessage,
} = require('../services/conversationsService');

function statusFromError(error) {
  return error && error.status ? error.status : 500;
}

async function list(req, res) {
  try {
    const conversations = await listConversations(
      req.app.locals.db,
      req.user.id,
    );
    res.json(conversations);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

async function getById(req, res) {
  try {
    const conversation = await getConversationById(
      req.app.locals.db,
      req.params.id,
      req.user.id,
    );

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json(conversation);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

async function create(req, res) {
  try {
    const conversation = await getOrCreateConversation(
      req.app.locals.db,
      req.user.id,
      req.body && req.body.participant_id,
    );
    res.status(200).json(conversation);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

async function createMessage(req, res) {
  try {
    const conversation = await addMessage(
      req.app.locals.db,
      req.params.id,
      req.user.id,
      req.body && req.body.content,
    );
    res.status(201).json(conversation);
  } catch (error) {
    res.status(statusFromError(error)).json({ error: error.message });
  }
}

module.exports = { list, getById, create, createMessage };
