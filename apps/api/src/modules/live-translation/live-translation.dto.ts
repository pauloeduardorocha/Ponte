import { IsString, IsUUID, MaxLength } from 'class-validator';

export class PublishTranslationDto {
  @IsUUID('4') sessionId!: string;
  @IsString() @MaxLength(512) audienceUrl!: string;
}
export class TranslationSessionDto {
  @IsUUID('4') sessionId!: string;
}
