export const environment = {
  production: false,
  supabase: {
    url: 'https://dgjpkelrxttlivivzayl.supabase.co',
    anonKey:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRnanBrZWxyeHR0bGl2aXZ6YXlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIwMTk5NDIsImV4cCI6MjA4NzU5NTk0Mn0.5NMwe-wQv8Ze6dvuAvMwFvxdqVfpZhmxAizsN49PV6Q',
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
