import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiRequest } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../auth/auth-context';
import { CachedQueryStatus } from './CachedQueryStatus';

import type {
  ConversationPerson as Person,
  ConversationPostView as Post,
  ConversationPageView as Page,
  ConversationDetailView as Detail,
} from '@church/shared';
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a ação.';

function encodeMentions(
  body: string,
  references: { label: string; person: Person }[],
) {
  if (!references.length) return body;
  const labels = [...references]
    .sort((a, b) => b.label.length - a.label.length)
    .map((reference) => reference.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const pattern = new RegExp(
    `(^|\\s)(${labels.join('|')})(?=$|\\s|[.,!?;:])`,
    'g',
  );
  return body.replace(pattern, (_match, prefix: string, label: string) => {
    const person = references.find(
      (reference) => reference.label === label,
    )!.person;
    return `${prefix}@[${person.name.replace(/[\]\r\n]/g, '')}](${person.id})`;
  });
}

function ConversationComposer({
  topicId,
  onSaved,
}: {
  topicId?: string;
  onSaved: (id: string, page?: number) => void;
}) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [references, setReferences] = useState<
    { label: string; person: Person }[]
  >([]);
  const [image, setImage] = useState<string>();
  const [fileError, setFileError] = useState('');
  const [reading, setReading] = useState(false);
  const [mention, setMention] = useState<{
    start: number;
    end: number;
    q: string;
  }>();
  const [search, setSearch] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(mention?.q ?? ''), 250);
    return () => window.clearTimeout(timer);
  }, [mention?.q]);
  const members = useQuery({
    queryKey: ['conversations', 'members', search],
    queryFn: () =>
      apiRequest<Person[]>('/conversations/members', { query: { q: search } }),
    enabled: !!mention && search.length >= 2 && search === mention.q,
  });
  const save = useMutation({
    mutationFn: () =>
      apiRequest<{ id: string; page?: number }>(
        topicId ? `/conversations/${topicId}/replies` : '/conversations',
        {
          method: 'POST',
          body: {
            body: encodeMentions(body, references),
            ...(topicId ? {} : { title }),
            ...(image ? { image } : {}),
          },
        },
      ),
    onSuccess: (result) => {
      setBody('');
      setImage(undefined);
      setMention(undefined);
      setReferences([]);
      onSaved(result.id, result.page);
    },
  });
  function detect(value: string, caret: number) {
    const match = /(?:^|\s)@([^@\s]{0,120})$/.exec(value.slice(0, caret));
    setMention(
      match
        ? { start: caret - match[1]!.length - 1, end: caret, q: match[1]! }
        : undefined,
    );
  }
  async function selectImage(file?: File) {
    setFileError('');
    setImage(undefined);
    if (!file) return;
    if (
      file.size > 1024 * 1024 ||
      !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)
    ) {
      setFileError('Escolha uma imagem PNG, JPEG ou WebP de até 1 MB.');
      return;
    }
    setReading(true);
    try {
      const result = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () =>
          reject(new Error('Não foi possível ler a imagem.'));
        reader.readAsDataURL(file);
      });
      setImage(result);
    } catch (error) {
      setFileError(errorMessage(error));
    } finally {
      setReading(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!save.isPending && !reading) save.mutate();
  }
  return (
    <Stack component="form" spacing={2} onSubmit={submit}>
      {!topicId && (
        <TextField
          label="Título da conversa"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          slotProps={{ htmlInput: { maxLength: 160 } }}
        />
      )}
      <TextField
        label={topicId ? 'Sua resposta' : 'Tópico inicial'}
        multiline
        minRows={4}
        required
        value={body}
        inputRef={input}
        onChange={(e) => {
          setBody(e.target.value);
          detect(
            e.target.value,
            e.target.selectionStart ?? e.target.value.length,
          );
        }}
        onSelect={() => {
          if (input.current)
            detect(input.current.value, input.current.selectionStart);
        }}
        helperText="Links são aceitos. Digite @ e pelo menos 2 letras para encontrar um membro."
        slotProps={{ htmlInput: { maxLength: 10000 } }}
      />
      {mention && search === mention.q && search.length >= 2 && (
        <Box aria-label="Sugestões de membros">
          {members.isFetching && (
            <Typography role="status">Buscando membros…</Typography>
          )}
          {members.isError && (
            <Alert severity="error">Não foi possível buscar membros.</Alert>
          )}
          {members.data?.length === 0 && (
            <Typography>Nenhum membro encontrado.</Typography>
          )}
          {members.data?.map((member) => (
            <Button
              key={member.id}
              onClick={() => {
                let label =
                  references.find(
                    (reference) => reference.person.id === member.id,
                  )?.label ?? `@${member.name}`;
                let suffix = 2;
                while (
                  references.some(
                    (reference) =>
                      reference.label === label &&
                      reference.person.id !== member.id,
                  )
                )
                  label = `@${member.name} (${suffix++})`;
                setReferences((current) => [
                  ...current.filter(
                    (reference) => reference.person.id !== member.id,
                  ),
                  { label, person: member },
                ]);
                const token = `${label} `;
                setBody(
                  body.slice(0, mention.start) +
                    token +
                    body.slice(mention.end),
                );
                setMention(undefined);
                requestAnimationFrame(() => {
                  input.current?.focus();
                  input.current?.setSelectionRange(
                    mention.start + token.length,
                    mention.start + token.length,
                  );
                });
              }}
            >
              @{member.name}
            </Button>
          ))}
        </Box>
      )}
      <Button component="label" disabled={reading || save.isPending}>
        Anexar imagem (até 1 MB)
        <input
          hidden
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => {
            void selectImage(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </Button>
      {image && (
        <Box>
          <Box
            component="img"
            src={image}
            alt="Imagem anexada"
            sx={{ maxWidth: '100%', maxHeight: 240 }}
          />
          <Button onClick={() => setImage(undefined)}>Remover imagem</Button>
        </Box>
      )}
      {fileError && <Alert severity="error">{fileError}</Alert>}
      {save.isError && (
        <Alert severity="error">{errorMessage(save.error)}</Alert>
      )}
      <Button
        type="submit"
        variant="contained"
        disabled={
          save.isPending ||
          reading ||
          !body.trim() ||
          (!topicId && !title.trim())
        }
      >
        {save.isPending
          ? 'Publicando…'
          : topicId
            ? 'Responder'
            : 'Criar conversa'}
      </Button>
    </Stack>
  );
}

function MessageText({ post }: { post: Post }) {
  const parts = post.body.split(
    /(@\[[^\]\r\n]{1,120}\]\([0-9a-f-]{36}\)|https?:\/\/[^\s<>]+)/gi,
  );
  return (
    <Typography
      component="div"
      sx={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}
    >
      {parts.map((part, index) => {
        const mention = /^@\[[^\]]+\]\(([0-9a-f-]{36})\)$/i.exec(part);
        if (mention)
          return (
            <Box
              component="span"
              key={index}
              sx={{ color: 'primary.main', fontWeight: 600 }}
            >
              @
              {post.mentions.find((m) => m.id === mention[1]!.toLowerCase())
                ?.name ?? 'membro indisponível'}
            </Box>
          );
        if (/^https?:\/\//i.test(part))
          return (
            <a
              key={index}
              href={part}
              target="_blank"
              rel="noopener noreferrer"
            >
              {part}
            </a>
          );
        return part;
      })}
    </Typography>
  );
}

function ConversationImage({ id }: { id: string }) {
  const image = useQuery({
    queryKey: ['conversations', 'image', id],
    queryFn: () => apiRequest<{ image: string }>(`/conversations/${id}/image`),
  });
  if (image.isPending)
    return <CircularProgress size={24} aria-label="Carregando imagem" />;
  if (image.isError)
    return (
      <Alert
        severity="warning"
        action={
          <Button onClick={() => void image.refetch()}>Tentar novamente</Button>
        }
      >
        Imagem indisponível.
      </Alert>
    );
  return (
    <Box
      component="img"
      src={image.data.image}
      alt="Imagem da publicação"
      sx={{
        maxWidth: '100%',
        maxHeight: 600,
        objectFit: 'contain',
        borderRadius: 2,
      }}
    />
  );
}

function ConversationPost({
  post,
  topic,
  onDeleted,
}: {
  post: Post;
  topic?: boolean;
  onDeleted: () => void;
}) {
  const { user } = useAuth();
  const [confirm, setConfirm] = useState(false);
  const client = useQueryClient();
  const remove = useMutation({
    mutationFn: () =>
      apiRequest(`/conversations/${post.id}`, { method: 'DELETE' }),
    onSuccess: () => {
      client.removeQueries({ queryKey: ['conversations', 'image', post.id] });
      setConfirm(false);
      onDeleted();
    },
  });
  const canDelete =
    user?.id === post.authorId ||
    user?.roles?.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role));
  return (
    <Card variant="outlined">
      <CardContent>
        <Stack spacing={2}>
          {topic && (
            <Typography
              variant="h4"
              component="h1"
              sx={{ overflowWrap: 'anywhere' }}
            >
              {post.deletedAt ? 'conversa excluída' : post.title}
            </Typography>
          )}
          <Typography variant="body2" color="text.secondary">
            {post.author.name} · {formatDateTime(post.createdAt)}
          </Typography>
          {post.deletedAt ? (
            !topic && (
              <Typography color="text.secondary">mensagem excluída</Typography>
            )
          ) : (
            <>
              <MessageText post={post} />
              {post.hasImage && <ConversationImage id={post.id} />}
              {canDelete && (
                <Button
                  color="error"
                  sx={{ alignSelf: 'flex-start' }}
                  onClick={() => setConfirm(true)}
                >
                  Excluir {topic ? 'conversa' : 'mensagem'}
                </Button>
              )}
            </>
          )}
          {remove.isError && (
            <Alert severity="error">{errorMessage(remove.error)}</Alert>
          )}
        </Stack>
      </CardContent>
      <Dialog
        open={confirm}
        onClose={() => {
          if (!remove.isPending) setConfirm(false);
        }}
        aria-labelledby={`delete-${post.id}`}
      >
        <DialogTitle id={`delete-${post.id}`}>
          Excluir {topic ? 'conversa' : 'mensagem'}?
        </DialogTitle>
        <DialogContent>
          O conteúdo deixará de ser exibido. O registro continuará preservado.
        </DialogContent>
        <DialogActions>
          <Button disabled={remove.isPending} onClick={() => setConfirm(false)}>
            Cancelar
          </Button>
          <Button
            color="error"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            Excluir
          </Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}

export function ConversationsCarousel() {
  const [create, setCreate] = useState(false);
  const navigate = useNavigate();
  const client = useQueryClient();
  const scroller = useRef<HTMLDivElement>(null);
  const list = useInfiniteQuery({
    queryKey: ['conversations', 'list'],
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      apiRequest<Page>('/conversations', { query: { page: pageParam } }),
    getNextPageParam: (last, pages) =>
      last.hasMore ? pages.length : undefined,
  });
  const posts = [
    ...new Map(
      list.data?.pages
        .flatMap((page) => page.items)
        .map((post) => [post.id, post]),
    ).values(),
  ];
  return (
    <Stack spacing={2} component="section" aria-label="Painéis de conversas">
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="h5" component="h2">
          Conversas
        </Typography>
        <Button variant="contained" onClick={() => setCreate(true)}>
          Nova conversa
        </Button>
      </Stack>
      <CachedQueryStatus
        updatedAt={list.dataUpdatedAt}
        refreshing={list.isFetching}
        onRefresh={() => void list.refetch()}
        label="conversas"
      />
      {list.isPending && <CircularProgress aria-label="Carregando conversas" />}
      {list.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void list.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          {errorMessage(list.error)}
        </Alert>
      )}
      {list.data?.pages[0]?.items.length === 0 && (
        <Alert severity="info">Comece uma conversa com a comunidade.</Alert>
      )}
      <Stack direction="row" spacing={1}>
        <Button
          aria-label="Conversas anteriores"
          onClick={() =>
            scroller.current?.scrollBy({ left: -320, behavior: 'smooth' })
          }
        >
          Anterior
        </Button>
        <Button
          aria-label="Próximas conversas"
          onClick={() =>
            scroller.current?.scrollBy({ left: 320, behavior: 'smooth' })
          }
        >
          Próxima
        </Button>
      </Stack>
      <Box
        ref={scroller}
        sx={{
          display: 'flex',
          gap: 2,
          overflowX: 'auto',
          scrollSnapType: 'x mandatory',
          pb: 1,
        }}
      >
        {posts.map((post) => (
          <Card
            key={post.id}
            variant="outlined"
            sx={{ flex: '0 0 min(300px, 85vw)', scrollSnapAlign: 'start' }}
          >
            <CardActionArea
              component={Link}
              role="link"
              to={`/conversations/${post.id}`}
              sx={{ height: '100%' }}
            >
              <CardContent>
                <Stack spacing={1}>
                  <Typography
                    variant="h6"
                    component="h3"
                    sx={{ overflowWrap: 'anywhere' }}
                  >
                    {post.deletedAt ? 'conversa excluída' : post.title}
                  </Typography>
                  <Typography variant="body2">
                    {post.author.name} · {formatDateTime(post.createdAt)}
                  </Typography>
                  {!post.deletedAt && (
                    <Typography
                      color="text.secondary"
                      sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {post.body.replace(
                        /@\[([^\]]+)\]\([0-9a-f-]{36}\)/gi,
                        '@$1',
                      )}
                    </Typography>
                  )}
                  <Typography variant="caption">
                    {post._count?.replies ?? 0} respostas
                  </Typography>
                </Stack>
              </CardContent>
            </CardActionArea>
          </Card>
        ))}
      </Box>
      {list.hasNextPage && (
        <Button
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          Carregar mais conversas
        </Button>
      )}
      <Dialog
        open={create}
        onClose={() => setCreate(false)}
        fullWidth
        maxWidth="sm"
        aria-labelledby="new-conversation"
      >
        <DialogTitle id="new-conversation">Nova conversa</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 1 }}>
            <ConversationComposer
              onSaved={(id) => {
                void client.invalidateQueries({
                  queryKey: ['conversations', 'list'],
                });
                setCreate(false);
                navigate(`/conversations/${id}`);
              }}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreate(false)}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export function ConversationPage() {
  const { id } = useParams();
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const detail = useQuery({
    queryKey: ['conversations', 'detail', id, page],
    queryFn: () =>
      apiRequest<Detail>(`/conversations/${id}`, { query: { page } }),
    enabled: !!id,
  });
  function refresh() {
    void client.invalidateQueries({ queryKey: ['conversations'] });
  }
  return (
    <Stack spacing={3}>
      <Button component={Link} to="/" sx={{ alignSelf: 'flex-start' }}>
        Voltar para o início
      </Button>
      <CachedQueryStatus
        updatedAt={detail.dataUpdatedAt}
        refreshing={detail.isFetching}
        onRefresh={refresh}
        label="conversa"
      />
      {detail.isPending && (
        <CircularProgress aria-label="Carregando conversa" />
      )}
      {detail.isError && (
        <Alert
          severity="error"
          action={
            <Button onClick={() => void detail.refetch()}>
              Tentar novamente
            </Button>
          }
        >
          {errorMessage(detail.error)}
        </Alert>
      )}
      {detail.data && (
        <>
          <ConversationPost
            post={detail.data.topic}
            topic
            onDeleted={refresh}
          />
          <Typography variant="h5" component="h2">
            Respostas
          </Typography>
          {detail.data.items.length === 0 && (
            <Typography color="text.secondary">
              Ainda não há respostas.
            </Typography>
          )}
          {detail.data.items.map((post) => (
            <ConversationPost key={post.id} post={post} onDeleted={refresh} />
          ))}
          <Stack direction="row" spacing={2} alignItems="center">
            <Button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anteriores
            </Button>
            <Typography>Página {page + 1}</Typography>
            <Button
              disabled={!detail.data.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              Próximas
            </Button>
          </Stack>
          {!detail.data.topic.deletedAt && (
            <ConversationComposer
              topicId={id}
              onSaved={(_replyId, replyPage) => {
                setPage(replyPage ?? 0);
                refresh();
              }}
            />
          )}
        </>
      )}
    </Stack>
  );
}
