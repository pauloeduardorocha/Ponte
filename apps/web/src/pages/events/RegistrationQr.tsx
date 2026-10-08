import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Box, Typography } from '@mui/material';
export function RegistrationQr({ token }: { token: string }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(token, { width: 180, margin: 2 }).then((value) => {
      if (active) setUrl(value);
    });
    return () => {
      active = false;
    };
  }, [token]);
  return (
    <Box>
      {url && (
        <Box
          component="img"
          src={url}
          alt="QR Code da inscrição"
          width={180}
          height={180}
        />
      )}
      <Typography variant="caption" display="block">
        {token}
      </Typography>
    </Box>
  );
}
