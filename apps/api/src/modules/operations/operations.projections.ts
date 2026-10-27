export const operationalMemberSelect = {
  id: true,
  name: true,
  status: true,
} as const;
export const personInclude = {
  member: { select: operationalMemberSelect },
  visitor: { select: { id: true, name: true } },
} as const;
export const followInclude = {
  ...personInclude,
  assignedTo: { select: { id: true, name: true } },
} as const;
export const groupInclude = {
  leader: { select: operationalMemberSelect },
  coLeader: { select: operationalMemberSelect },
  host: { select: operationalMemberSelect },
} as const;
export const ministryInclude = {
  leader: { select: operationalMemberSelect },
  members: {
    where: { active: true, leftAt: null, role: 'LEADER' },
    select: { member: { select: operationalMemberSelect } },
  },
} as const;
export const eventInclude = {
  ministry: { select: { id: true, name: true } },
  smallGroup: { select: { id: true, name: true } },
} as const;
export const scheduleInclude = {
  event: {
    select: {
      id: true,
      name: true,
      startsAt: true,
      endsAt: true,
      status: true,
    },
  },
  ministry: { select: { id: true, name: true } },
} as const;
