require('dotenv').config();
const cloudinary = require('cloudinary').v2;
const fs = require('fs');

cloudinary.config({ 
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME, 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

async function buildCreative() {
  console.log("Fetching resources from Cloudinary...");
  try {
    const result = await cloudinary.search
      .expression('folder:shubhuu-creative')
      .sort_by('created_at', 'desc')
      .max_results(100)
      .execute();
      
    const resources = result.resources;
    console.log(`Found ${resources.length} items in Cloudinary.`);
    
    let htmlContent = '';
    // The classes cycle: item-2, item-3, item-4, item-1, item-2...
    const layoutClasses = ['item-2', 'item-3', 'item-4', 'item-1'];
    
    resources.forEach((item, index) => {
      // index starts at 0, which corresponds to item number 2 (bg-number "02")
      const itemNumber = index + 2;
      const bgNumber = itemNumber.toString().padStart(2, '0');
      const layoutClass = layoutClasses[index % layoutClasses.length];
      
      const title = item.context && item.context.custom && item.context.custom.caption ? item.context.custom.caption : (item.filename || 'Creative');
      const typeLabel = item.resource_type === 'video' ? '// VIDEO' : '// PHOTO';
      
      let mediaHtml = '';
      if (item.resource_type === 'video') {
        mediaHtml = `<video src="${item.secure_url}" autoplay loop muted playsinline alt="${title}"></video>`;
      } else {
        mediaHtml = `<img src="${item.secure_url}" alt="${title}">`;
      }
      
      htmlContent += `
  <!-- Generated Item ${itemNumber} -->
  <div class="gallery-item ${layoutClass} tilt-card">
    <div class="bg-number">${bgNumber}</div>
    <div class="card-inner">
      ${mediaHtml}
      <div class="caption">
        <div class="caption-title">${title}</div>
        <div class="caption-num">${typeLabel}</div>
      </div>
    </div>
  </div>
`;
    });
    
    // Inject into creative.html
    const templatePath = 'creative.html';
    const template = fs.readFileSync(templatePath, 'utf-8');
    const startTag = '<!-- CLOUDINARY_START -->';
    const endTag = '<!-- CLOUDINARY_END -->';
    
    const startIndex = template.indexOf(startTag);
    const endIndex = template.indexOf(endTag);
    
    if (startIndex !== -1 && endIndex !== -1) {
      const newHtml = template.substring(0, startIndex + startTag.length) + '\n' + htmlContent + '\n  ' + template.substring(endIndex);
      fs.writeFileSync(templatePath, newHtml);
      console.log('creative.html successfully updated with Cloudinary photos!');
    } else {
      console.error('Could not find CLOUDINARY_START or CLOUDINARY_END tags in creative.html');
      process.exit(1);
    }
  } catch (error) {
    console.error("Error fetching from Cloudinary:", error);
    process.exit(1);
  }
}

buildCreative();
