import fs from 'fs';

// Fix the duplicate calculateAverage function in server/index.js
async function fixDuplicateFunctions() {
  try {
    console.log('Fixing duplicate function declarations in server/index.js...');
    
    // Read the file
    const filePath = './server/index.js';
    const content = await fs.promises.readFile(filePath, 'utf8');
    
    // We need to find the second declaration of calculateAverage and comment it out
    const pattern = /function calculateAverage\(items, field\) \{[\s\S]+?\}/g;
    
    // Find all occurrences
    const matches = [...content.matchAll(pattern)];
    
    if (matches.length < 2) {
      console.log('No duplicate calculateAverage function found.');
      return;
    }
    
    console.log(`Found ${matches.length} declarations of calculateAverage.`);
    
    // Get the position of the second match
    const secondMatchPos = matches[1].index;
    const secondMatchText = matches[1][0];
    
    // Comment out the second declaration
    const commentedText = '// Duplicate function - commented out\n// ' + 
      secondMatchText.replace(/\n/g, '\n// ');
    
    // Replace in the content
    const newContent = content.substring(0, secondMatchPos) + 
      commentedText + 
      content.substring(secondMatchPos + secondMatchText.length);
    
    // Write the updated content back to the file
    await fs.promises.writeFile(filePath, newContent, 'utf8');
    
    console.log('File updated successfully. Duplicate function has been commented out.');
  } catch (error) {
    console.error('Error fixing duplicate functions:', error);
  }
}

// Execute the fix
fixDuplicateFunctions(); 