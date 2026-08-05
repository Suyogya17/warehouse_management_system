const router = require('express').Router();
const controller = require('../controllers/chatController');
const { authenticate } = require('../middleware/authMiddleware');
const { chatAttachmentUpload } = require('../middleware/chatAttachmentUpload');

router.use(authenticate);

router.get('/unread-count', controller.getUnreadCount);
router.get('/presence/me', controller.getMyPresence);
router.put('/presence/me', controller.updateMyPresence);
router.post('/presence/heartbeat', controller.heartbeatPresence);
router.get('/users', controller.listChatUsers);
router.get('/reference-options', controller.getReferenceOptions);
router.get('/attachments/:attachmentId', controller.downloadAttachment);
router.put('/messages/:messageId', controller.editMessage);
router.delete('/messages/:messageId', controller.deleteMessage);

router.get('/staff/users', controller.listStaffUsers);
router.get('/staff/conversations', controller.listStaffConversations);
router.post('/staff/conversations', controller.createStaffConversation);
router.get('/staff/conversations/:id', controller.getStaffConversation);
router.post('/staff/conversations/:id/messages', controller.sendStaffMessage);
router.post('/staff/conversations/:id/references', controller.sendStaffReference);
router.post('/staff/conversations/:id/attachments', chatAttachmentUpload, controller.sendStaffAttachment);
router.put('/staff/conversations/:id/read', controller.markRead);

router.get('/me', controller.getMyConversation);
router.post('/me/messages', controller.sendMyMessage);
router.post('/me/references', controller.sendMyReference);
router.post('/me/attachments', chatAttachmentUpload, controller.sendMyAttachment);
router.put('/me/read', controller.markRead);

router.get('/conversations', controller.listConversations);
router.post('/conversations', controller.createAdminConversation);
router.get('/conversations/:id', controller.getAdminConversation);
router.post('/conversations/:id/messages', controller.sendAdminMessage);
router.post('/conversations/:id/references', controller.sendAdminReference);
router.post('/conversations/:id/attachments', chatAttachmentUpload, controller.sendAdminAttachment);
router.put('/conversations/:id/read', controller.markRead);
router.put('/conversations/:id/status', controller.updateStatus);

module.exports = router;
