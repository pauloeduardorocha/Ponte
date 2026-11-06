export interface ConversationPerson {
  avatar?: string | null;
  id: string;
  name: string;
}

export interface ConversationPostView {
  id: string;
  topicId: string | null;
  parentId?: string | null;
  title: string | null;
  body: string;
  authorId: string;
  author: ConversationPerson;
  mentions: ConversationPerson[];
  createdAt: string;
  deletedAt: string | null;
  hasImage: boolean;
  _count?: { replies: number; children?: number };
}

export interface ConversationPageView {
  items: ConversationPostView[];
  hasMore: boolean;
}

export interface ConversationDetailView extends ConversationPageView {
  topic: ConversationPostView;
}
