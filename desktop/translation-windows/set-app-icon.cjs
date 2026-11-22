(async () => {
  const { rcedit } = await import('rcedit');
  await rcedit(process.argv[2], { icon: process.argv[3] });
})().catch(error => { console.error(error.message); process.exitCode = 1; });
