export const occupiedRegistrations = () => ({
  OR: [
    { status: { in: ['REGISTERED', 'APPROVED'] } },
    { status: 'PENDING_PAYMENT', expiresAt: { gt: new Date() } },
  ],
});
