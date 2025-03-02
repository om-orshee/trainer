// file: setup.js
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const readline = require("readline");

// Configuration
const config = {
  dataDir: "./training-data",
  outputDir: "./finetuned-model",
  modelName: "deepseek-ai/deepseek-coder-v2-base",
  sourceCodeDirs: [], // Will be populated by user input
  fileExtensions: [".js", ".jsx", ".ts", ".tsx"], // Default to JavaScript files
  excludePatterns: ["node_modules", "dist", "build", ".git"],
  batchSize: 4,
};

// Create necessary directories
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}

// Interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// 1. Ask user for directories containing source code
function askForSourceDirectories() {
  rl.question(
    'Enter path to directory containing source code (or "done" to finish): ',
    (answer) => {
      if (answer.toLowerCase() === "done") {
        if (config.sourceCodeDirs.length === 0) {
          console.log("You must specify at least one source directory.");
          askForSourceDirectories();
          return;
        }
        askForFileExtensions();
        return;
      }

      // Verify the directory exists
      if (fs.existsSync(answer) && fs.lstatSync(answer).isDirectory()) {
        config.sourceCodeDirs.push(path.resolve(answer));
        console.log(`Added: ${answer}`);
      } else {
        console.log(`Directory not found: ${answer}`);
      }

      askForSourceDirectories();
    }
  );
}

// 2. Ask for file extensions to include
function askForFileExtensions() {
  rl.question(
    `Enter file extensions to include (default: ${config.fileExtensions.join(
      ", "
    )}): `,
    (answer) => {
      if (answer.trim()) {
        // Parse extensions from user input
        config.fileExtensions = answer.split(",").map((ext) => {
          ext = ext.trim();
          return ext.startsWith(".") ? ext : `.${ext}`;
        });
      }

      confirmConfiguration();
    }
  );
}

// 3. Confirm configuration before proceeding
function confirmConfiguration() {
  console.log("\nConfiguration Summary:");
  console.log(`Source Directories: ${config.sourceCodeDirs.join(", ")}`);
  console.log(`File Extensions: ${config.fileExtensions.join(", ")}`);
  console.log(`Excluded Patterns: ${config.excludePatterns.join(", ")}`);
  console.log(`Output Directory: ${config.outputDir}`);

  rl.question("Proceed with this configuration? (y/n): ", (answer) => {
    if (answer.toLowerCase() === "y") {
      rl.close();
      collectSourceFiles();
    } else {
      console.log("Configuration cancelled. Please run the script again.");
      process.exit(0);
    }
  });
}

// 4. Collect all source files based on configuration
function collectSourceFiles() {
  console.log("\nCollecting source files...");

  const allFiles = [];

  config.sourceCodeDirs.forEach((dir) => {
    const files = findFilesRecursive(dir);
    allFiles.push(...files);
  });

  console.log(`Found ${allFiles.length} files matching your criteria.`);

  if (allFiles.length === 0) {
    console.log("No files found. Please check your configuration.");
    process.exit(1);
  }

  // Write file list for reference
  fs.writeFileSync(
    path.join(config.dataDir, "source_files.txt"),
    allFiles.join("\n")
  );

  // Process the files to create training data
  processSourceFiles(allFiles);
}

// Helper function to find files recursively
function findFilesRecursive(dir) {
  const results = [];

  const files = fs.readdirSync(dir);

  files.forEach((file) => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    // Skip excluded directories
    if (config.excludePatterns.some((pattern) => fullPath.includes(pattern))) {
      return;
    }

    if (stat.isDirectory()) {
      // Recursively search directories
      results.push(...findFilesRecursive(fullPath));
    } else {
      // Check if file extension matches
      const ext = path.extname(file);
      if (config.fileExtensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  });

  return results;
}

// Start the process
console.log("DeepSeek Coder v2 Fine-tuning Setup");
console.log("==================================\n");
askForSourceDirectories();

// This function will be implemented in the next file
function processSourceFiles(files) {
  console.log("Now processing source files to create training data...");
  // This will be implemented in the data-processor.js file
}
