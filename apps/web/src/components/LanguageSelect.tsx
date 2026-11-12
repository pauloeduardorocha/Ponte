import { Box, MenuItem, Select } from '@mui/material';
import { setLocale, t, useLocale, type Locale } from '../i18n';

const languages: { locale: Locale; name: string; flag: string }[] = [
  { locale: 'pt-PT', name: 'Português (Portugal)', flag: 'pt' },
  { locale: 'pt-BR', name: 'Português (Brasil)', flag: 'br' },
  { locale: 'en', name: 'English', flag: 'gb' },
];

export function LanguageSelect() {
  const locale = useLocale();
  return (
    <Select
      value={locale}
      onChange={(event) => setLocale(event.target.value as Locale)}
      size="small"
      inputProps={{ 'aria-label': t('Idioma') }}
      sx={{ ml: 1, mr: 1, minWidth: 100, '& .MuiSelect-select': { py: 0.75 } }}
      renderValue={(value) => {
        const language = languages.find((entry) => entry.locale === value)!;
        return (
          <Box
            component="span"
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <img
              src={`/flags/${language.flag}.svg`}
              width={24}
              height={16}
              alt=""
            />
            <Box component="span">
              {value === 'en' ? 'EN' : value.toUpperCase()}
            </Box>
          </Box>
        );
      }}
    >
      {languages.map((language) => (
        <MenuItem
          key={language.locale}
          value={language.locale}
          lang={language.locale}
        >
          <Box
            component="img"
            src={`/flags/${language.flag}.svg`}
            width={24}
            height={16}
            alt=""
            sx={{ mr: 1 }}
          />
          {language.name}
        </MenuItem>
      ))}
    </Select>
  );
}
