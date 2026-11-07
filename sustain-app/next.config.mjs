/** @type {import('next').NextConfig} */
export default {
  // the seed data is read with fs at runtime; make sure Vercel ships it with the functions
  outputFileTracingIncludes: { '/**': ['./data/**'] },
  serverExternalPackages: ['@libsql/client'],
};
