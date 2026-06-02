import midtransClient from "midtrans-client";

export const createSnap = ({
  serverKey,
  clientKey,
  isProduction
}) => {
  return new midtransClient.Snap({
    isProduction,
    serverKey,
    clientKey,
  });
};