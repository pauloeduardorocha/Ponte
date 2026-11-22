const os = require("node:os");
const dgram = require("node:dgram");
function isPrivateIPv4(ip) {
  if (typeof ip !== "string" || !/^\d{1,3}(\.\d{1,3}){3}$/.test(ip))
    return false;
  const a = ip.split(".").map(Number);
  if (a.some((n) => n > 255)) return false;
  return (
    a[0] === 10 ||
    (a[0] === 172 && a[1] >= 16 && a[1] <= 31) ||
    (a[0] === 192 && a[1] === 168)
  );
}
function preferredAddress() {
  return new Promise((resolve) => {
    const socket = dgram.createSocket("udp4");
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {}
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), 250);
    socket.once("error", () => finish(null));
    // Connecting a UDP socket selects the OS route without sending audio or packets.
    socket.connect(9, "1.1.1.1", () => {
      try {
        finish(socket.address().address);
      } catch {
        finish(null);
      }
    });
  });
}
function selectAudienceUrl(
  links,
  interfaces = os.networkInterfaces(),
  preferred = null,
) {
  const candidates = [];
  for (const [name, addresses] of Object.entries(interfaces))
    for (const address of addresses || []) {
      if (
        address.internal ||
        address.family !== "IPv4" ||
        !isPrivateIPv4(address.address)
      )
        continue;
      const link = links.find((value) => {
        try {
          return new URL(value).hostname === address.address;
        } catch {
          return false;
        }
      });
      if (!link) continue;
      const virtual =
        /vpn|tun|tap|virtual|vethernet|docker|wsl|tailscale|wireguard|hyper-v|vmware|zerotier|loopback/i.test(
          name,
        );
      const score =
        (virtual ? -100 : 0) +
        (address.address === preferred ? 50 : 0) +
        (/wi-?fi|wlan|wireless|ethernet|rede sem fio/i.test(name) ? 10 : 0);
      candidates.push({ link, score });
    }
  candidates.sort((a, b) => b.score - a.score || a.link.localeCompare(b.link));
  return candidates[0]?.link ?? null;
}
module.exports = { isPrivateIPv4, preferredAddress, selectAudienceUrl };
