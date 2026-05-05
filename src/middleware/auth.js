import jwt from "jsonwebtoken";
export default function auth(req, res, next) {
  let token;

  // cek cookie dulu
  if (req.cookies.token) {
    token = req.cookies.token;
  }
  // fallback ke header
  else if (req.headers.authorization) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({ msg: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ msg: "Invalid token" });
  }
}
