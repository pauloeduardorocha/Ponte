import { errorMessage } from './conversation-utils';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { apiRequest } from '../lib/api';
import type {
  ConversationPerson as Person,
  ConversationPostView as Post,
} from '@church/shared';
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

export function ConversationComposer({
  topicId,
  parentId,
  onSaved,
}: {
  topicId?: string;
  parentId?: string;
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
            ...(parentId ? { parentId } : {}),
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
        label={
          parentId
            ? 'Sua resposta ao comentário'
            : topicId
              ? 'Escreva um comentário'
              : 'Tópico inicial'
        }
        multiline
        minRows={topicId ? 2 : 4}
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
            ? parentId
              ? 'Responder'
              : 'Comentar'
            : 'Criar conversa'}
      </Button>
    </Stack>
  );
}

export function MessageText({ post }: { post: Post }) {
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

export function ConversationImage({ id }: { id: string }) {
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
