import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Module,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PrismaService } from '../../database/prisma.service';
import { AuthRequest } from '../auth/auth.guard';

export class ConversationMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 10000 })
  @IsString()
  @MinLength(1)
  @MaxLength(10000)
  body!: string;
  @ApiPropertyOptional({
    maxLength: 1400000,
    description: 'Data URI PNG/JPEG/WebP; até 1 MB de bytes decodificados.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1400000)
  image?: string;
}
export class ConversationTopicDto extends ConversationMessageDto {
  @ApiProperty({ minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title!: string;
}

export class ConversationReplyDto extends ConversationMessageDto {
  @ApiPropertyOptional({
    format: 'uuid',
    description: 'Comentário ao qual esta resposta está vinculada.',
  })
  @IsOptional()
  @IsUUID()
  parentId?: string;
}

export function validateConversationImage(image?: string): string | undefined {
  if (image === undefined) return undefined;
  const match =
    /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
  if (!match)
    throw new BadRequestException(
      'Use uma imagem PNG, JPEG ou WebP de até 1 MB.',
    );
  const bytes = Buffer.from(match[2]!, 'base64');
  const valid =
    match[1] === 'png'
      ? bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : match[1] === 'jpeg'
        ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
        : bytes.toString('ascii', 0, 4) === 'RIFF' &&
          bytes.toString('ascii', 8, 12) === 'WEBP';
  if (
    !valid ||
    bytes.length > 1024 * 1024 ||
    bytes.toString('base64') !== match[2]
  )
    throw new BadRequestException('Imagem inválida ou maior que 1 MB.');
  return image;
}

const author = {
  select: {
    avatar: true,
    id: true,
    name: true,
    deletedAt: true,
    member: { select: { anonymizedAt: true } },
  },
} as const;
const fields = {
  id: true,
  topicId: true,
  parentId: true,
  title: true,
  body: true,
  authorId: true,
  author,
  mentions: true,
  createdAt: true,
  deletedAt: true,
  hasImage: true,
  _count: { select: { replies: true, children: true } },
} as const;
type VisiblePost = {
  deletedAt: Date | null;
  title: string | null;
  body: string;
  hasImage: boolean;
  mentions: string[];
  author: {
    avatar?: string | null;
    id: string;
    name: string;
    deletedAt: Date | null;
    member: { anonymizedAt: Date | null } | null;
  };
};

@Controller('conversations')
export class ConversationsController {
  constructor(private readonly db: PrismaService) {}

  private approved(r: AuthRequest) {
    if (r.user.status !== 'ACTIVE')
      throw new ForbiddenException('Conta aprovada necessária.');
  }

  private page(value?: string) {
    if (value === undefined) return 0;
    if (typeof value !== 'string' || !/^\d{1,6}$/.test(value))
      throw new BadRequestException('Página inválida.');
    return Number(value);
  }

  private order(value?: string): 'asc' | 'desc' {
    if (value !== undefined && value !== 'asc' && value !== 'desc')
      throw new BadRequestException('Ordem inválida.');
    return value === 'desc' ? 'desc' : 'asc';
  }

  private async visible<T extends VisiblePost>(posts: T[]) {
    const ids = [
      ...new Set(posts.filter((p) => !p.deletedAt).flatMap((p) => p.mentions)),
    ];
    const members = ids.length
      ? await this.db.member.findMany({
          where: { id: { in: ids }, status: 'ACTIVE', anonymizedAt: null },
          select: { id: true, name: true },
        })
      : [];
    return posts.map((p) => ({
      ...p,
      title: p.deletedAt ? null : p.title,
      body: p.deletedAt
        ? ''
        : p.body.replace(
            /@\[[^\]\r\n]{1,120}\]\(([0-9a-f-]{36})\)/gi,
            (_token, id: string) =>
              `@[${members.find((m) => m.id === id.toLowerCase())?.name.replace(/[\]\r\n]/g, '') ?? 'membro indisponível'}](${id.toLowerCase()})`,
          ),
      hasImage: !p.deletedAt && p.hasImage,
      mentions: p.deletedAt
        ? []
        : members.filter((m) => p.mentions.includes(m.id)),
      author: {
        avatar:
          p.author.deletedAt || p.author.member?.anonymizedAt
            ? null
            : (p.author.avatar ?? null),
        id: p.author.id,
        name:
          p.author.deletedAt || p.author.member?.anonymizedAt
            ? 'Membro indisponível'
            : p.author.name,
      },
    }));
  }

  private async content(dto: ConversationMessageDto) {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Escreva uma mensagem.');
    const mentions = [
      ...new Set(
        [...body.matchAll(/@\[[^\]\r\n]{1,120}\]\(([0-9a-f-]{36})\)/gi)].map(
          (m) => m[1]!.toLowerCase(),
        ),
      ),
    ];
    if (
      mentions.some(
        (id) =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
            id,
          ),
      ) ||
      mentions.length > 20
    )
      throw new BadRequestException('Use até 20 menções válidas.');
    if (
      mentions.length &&
      (await this.db.member.count({
        where: { id: { in: mentions }, status: 'ACTIVE', anonymizedAt: null },
      })) !== mentions.length
    )
      throw new BadRequestException(
        'Uma das menções não corresponde a um membro ativo.',
      );
    const image = validateConversationImage(dto.image);
    return { body, mentions, image, hasImage: !!image };
  }

  @Get() async list(@Req() r: AuthRequest, @Query('page') page?: string) {
    this.approved(r);
    const posts = await this.db.conversationPost.findMany({
      where: { topicId: null },
      select: { ...fields, _count: { select: { replies: true } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: this.page(page) * 20,
      take: 21,
    });
    return {
      items: await this.visible(posts.slice(0, 20)),
      hasMore: posts.length > 20,
    };
  }

  @Get('members') async members(@Req() r: AuthRequest, @Query('q') q = '') {
    this.approved(r);
    if (typeof q !== 'string') throw new BadRequestException('Busca inválida.');
    if (q.trim().length < 2) return [];
    if (q.length > 120) throw new BadRequestException('Busca muito longa.');
    return this.db.member.findMany({
      where: {
        status: 'ACTIVE',
        anonymizedAt: null,
        name: { contains: q.trim(), mode: 'insensitive' },
      },
      select: { id: true, name: true },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
      take: 10,
    });
  }

  @Get(':id') async detail(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('page') page?: string,
    @Query('order') order?: string,
  ) {
    this.approved(r);
    const topic = await this.db.conversationPost.findFirst({
      where: { id, topicId: null },
      select: fields,
    });
    if (!topic) throw new NotFoundException('Conversa não encontrada.');
    const replies = await this.db.conversationPost.findMany({
      where: { topicId: id, parentId: null },
      select: fields,
      orderBy: [{ createdAt: this.order(order) }, { id: this.order(order) }],
      skip: this.page(page) * 10,
      take: 11,
    });
    return {
      topic: (await this.visible([topic]))[0],
      items: await this.visible(replies.slice(0, 10)),
      hasMore: replies.length > 10,
    };
  }

  @Get(':id/replies') async replies(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('parentId', ParseUUIDPipe) parentId: string,
    @Query('page') page?: string,
    @Query('order') order?: string,
  ) {
    this.approved(r);
    if (
      !(await this.db.conversationPost.findFirst({
        where: { id: parentId, topicId: id },
        select: { id: true },
      }))
    )
      throw new NotFoundException('Comentário não encontrado nesta conversa.');
    const posts = await this.db.conversationPost.findMany({
      where: { topicId: id, parentId },
      select: fields,
      orderBy: [{ createdAt: this.order(order) }, { id: this.order(order) }],
      skip: this.page(page) * 10,
      take: 11,
    });
    return {
      items: await this.visible(posts.slice(0, 10)),
      hasMore: posts.length > 10,
    };
  }

  @Get(':id/image') async image(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.approved(r);
    const post = await this.db.conversationPost.findFirst({
      where: { id, deletedAt: null },
      select: { image: true },
    });
    if (!post?.image) throw new NotFoundException();
    return { image: post.image };
  }

  @Post() async create(
    @Req() r: AuthRequest,
    @Body() dto: ConversationTopicDto,
  ) {
    this.approved(r);
    if (!dto.title.trim()) throw new BadRequestException('Informe o título.');
    return this.db.conversationPost.create({
      data: {
        ...(await this.content(dto)),
        title: dto.title.trim(),
        authorId: r.user.id,
      },
      select: { id: true },
    });
  }

  @Post(':id/replies') async reply(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConversationReplyDto,
  ) {
    this.approved(r);
    const content = await this.content(dto);
    // Lock the topic so deletion and a simultaneous reply have a defined order.
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversation_posts WHERE id = ${id}::uuid FOR UPDATE`;
      if (
        !(await tx.conversationPost.findFirst({
          where: { id, topicId: null, deletedAt: null },
          select: { id: true },
        }))
      )
        throw new NotFoundException('Conversa indisponível para respostas.');
      if (dto.parentId) {
        await tx.$queryRaw`SELECT id FROM conversation_posts WHERE id = ${dto.parentId}::uuid FOR UPDATE`;
        if (
          !(await tx.conversationPost.findFirst({
            where: { id: dto.parentId, topicId: id, deletedAt: null },
            select: { id: true },
          }))
        )
          throw new NotFoundException(
            'Comentário indisponível para respostas.',
          );
      }
      const reply = await tx.conversationPost.create({
        data: {
          ...content,
          topicId: id,
          parentId: dto.parentId,
          authorId: r.user.id,
        },
        select: { id: true },
      });
      const count = await tx.conversationPost.count({
        where: { topicId: id, parentId: dto.parentId ?? null },
      });
      return { ...reply, page: Math.floor((count - 1) / 10) };
    });
  }

  @Delete(':id') async remove(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    this.approved(r);
    const post = await this.db.conversationPost.findUnique({
      where: { id },
      select: { authorId: true },
    });
    if (!post) throw new NotFoundException();
    if (
      post.authorId !== r.user.id &&
      !r.user.roles?.some((role) => ['ADMIN', 'SUPER_ADMIN'].includes(role))
    )
      throw new ForbiddenException(
        'Apenas o autor ou administradores podem excluir.',
      );
    await this.db.conversationPost.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: r.user.id },
    });
    return { deleted: true };
  }
}

@Module({ controllers: [ConversationsController] })
export class ConversationsModule {}
