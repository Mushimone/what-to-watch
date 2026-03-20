export const environment = {
  production: true,
  supabase: {
    url: 'YOUR_SUPABASE_URL',
    anonKey: 'YOUR_SUPABASE_ANON_KEY',
  },
  tmdb: {
    apiKey: 'YOUR_TMDB_API_KEY',
    baseUrl: 'https://api.themoviedb.org/3',
    imageBaseUrl: 'https://image.tmdb.org/t/p/w500',
  },
  anilist: {
    apiUrl: 'https://graphql.anilist.co',
  },
  gemini: {
    apiKey: 'YOUR_GEMINI_API_KEY',
  },
};
