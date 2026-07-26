require('dotenv').config();
const cloudinary = require('cloudinary').v2;

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

cloudinary.search.expression('folder:shubhuu-creative').with_field('context').max_results(1).execute().then(res => console.log(JSON.stringify(res.resources[0].context, null, 2)));
