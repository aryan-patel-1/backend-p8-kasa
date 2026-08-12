function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function formatTime(value) {
  if (!value) return '';

  const date = new Date(`${value.replace(' ', 'T')}Z`);
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Paris',
  }).format(date);
}

async function getMessages(db, conversationId, currentUserId) {
  const rows = await db.allAsync(`
    SELECT m.*, u.name AS author_name
    FROM messages m
    JOIN users u ON u.id = m.author_id
    WHERE m.conversation_id = ?
    ORDER BY m.id ASC
  `, [conversationId]);

  return rows.map((row) => ({
    id: String(row.id),
    authorName: row.author_id === currentUserId ? 'Vous' : row.author_name,
    content: row.content,
    sentAt: formatTime(row.created_at),
    isCurrentUser: row.author_id === currentUserId,
  }));
}

async function mapConversation(db, row, currentUserId) {
  const messages = await getMessages(db, row.id, currentUserId);

  return {
    id: String(row.id),
    participantId: row.participant_id,
    participantName: row.participant_name,
    participantPicture: row.participant_picture,
    preview: row.preview || 'Nouvelle conversation',
    updatedAt: formatTime(row.last_message_at),
    isUnread: false,
    messages,
  };
}

function conversationSelect() {
  return `
    SELECT
      c.*,
      CASE
        WHEN c.user_one_id = ? THEN c.user_two_id
        ELSE c.user_one_id
      END AS participant_id,
      u.name AS participant_name,
      u.picture AS participant_picture,
      (
        SELECT content
        FROM messages
        WHERE conversation_id = c.id
        ORDER BY id DESC
        LIMIT 1
      ) AS preview,
      (
        SELECT created_at
        FROM messages
        WHERE conversation_id = c.id
        ORDER BY id DESC
        LIMIT 1
      ) AS last_message_at
    FROM conversations c
    JOIN users u ON u.id = CASE
      WHEN c.user_one_id = ? THEN c.user_two_id
      ELSE c.user_one_id
    END
  `;
}

async function getConversationRow(db, conversationId, currentUserId) {
  return db.getAsync(`${conversationSelect()}
    WHERE c.id = ?
      AND (c.user_one_id = ? OR c.user_two_id = ?)
  `, [currentUserId, currentUserId, conversationId, currentUserId, currentUserId]);
}

async function listConversations(db, currentUserId) {
  const rows = await db.allAsync(`${conversationSelect()}
    WHERE c.user_one_id = ? OR c.user_two_id = ?
    ORDER BY COALESCE(last_message_at, c.updated_at) DESC, c.id DESC
  `, [currentUserId, currentUserId, currentUserId, currentUserId]);

  return Promise.all(
    rows.map((row) => mapConversation(db, row, currentUserId)),
  );
}

async function getConversationById(db, conversationId, currentUserId) {
  const row = await getConversationRow(db, conversationId, currentUserId);
  return row ? mapConversation(db, row, currentUserId) : null;
}

async function getOrCreateConversation(db, currentUserId, participantId) {
  const parsedParticipantId = Number(participantId);

  if (!Number.isInteger(parsedParticipantId) || parsedParticipantId <= 0) {
    throw createHttpError('participant_id is required', 400);
  }

  if (parsedParticipantId === currentUserId) {
    throw createHttpError('You cannot start a conversation with yourself', 400);
  }

  const participant = await db.getAsync(
    'SELECT id FROM users WHERE id = ?',
    [parsedParticipantId],
  );

  if (!participant) {
    throw createHttpError('User not found', 404);
  }

  const userOneId = Math.min(currentUserId, parsedParticipantId);
  const userTwoId = Math.max(currentUserId, parsedParticipantId);

  await db.runAsync(`
    INSERT OR IGNORE INTO conversations(user_one_id, user_two_id)
    VALUES (?, ?)
  `, [userOneId, userTwoId]);

  const row = await db.getAsync(`${conversationSelect()}
    WHERE c.user_one_id = ? AND c.user_two_id = ?
  `, [currentUserId, currentUserId, userOneId, userTwoId]);

  return mapConversation(db, row, currentUserId);
}

async function addMessage(db, conversationId, currentUserId, content) {
  const messageContent = typeof content === 'string' ? content.trim() : '';

  if (!messageContent || messageContent.length > 2000) {
    throw createHttpError('Message must contain between 1 and 2000 characters', 400);
  }

  const conversation = await getConversationRow(
    db,
    conversationId,
    currentUserId,
  );

  if (!conversation) {
    throw createHttpError('Conversation not found', 404);
  }

  await db.runAsync(`
    INSERT INTO messages(conversation_id, author_id, content)
    VALUES (?, ?, ?)
  `, [conversation.id, currentUserId, messageContent]);

  await db.runAsync(
    'UPDATE conversations SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [conversation.id],
  );

  return getConversationById(db, conversation.id, currentUserId);
}

module.exports = {
  listConversations,
  getConversationById,
  getOrCreateConversation,
  addMessage,
};
