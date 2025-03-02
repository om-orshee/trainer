// data-processor-eb.js
const fs = require("fs");
const path = require("path");

// Configuration
const config = {
  dataDir: "./raw-source-code",
  outputDir: "./training-data",
  examplesFile: "edgeblocks_training-data.jsonl",
};

// Ensure directories exist
if (!fs.existsSync(config.dataDir)) {
  fs.mkdirSync(config.dataDir, { recursive: true });
}
if (!fs.existsSync(config.outputDir)) {
  fs.mkdirSync(config.outputDir, { recursive: true });
}

// Function to find nested component structures if the directory exists
function findNestedComponents(rootDir) {
  const components = [];

  // Check if directory exists before trying to read it
  if (!fs.existsSync(rootDir)) {
    console.log(
      `Warning: Directory ${rootDir} does not exist. Skipping component search.`
    );
    return components;
  }

  // Find all directories that might be component folders
  const dirs = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => path.join(rootDir, dirent.name));

  dirs.forEach((componentDir) => {
    const componentName = path.basename(componentDir);

    // Skip node_modules, dist, etc.
    if (["node_modules", "dist", "build", ".git"].includes(componentName)) {
      return;
    }

    // Check if this directory has the main component files
    const files = fs.readdirSync(componentDir);
    const hasMainComponent =
      files.includes(`${componentName}.tsx`) ||
      files.includes(`${componentName}.jsx`) ||
      files.includes(`${componentName}.js`);
    const hasStyles =
      files.includes(`${componentName}.styles.ts`) ||
      files.includes(`${componentName}.styles.js`);
    const hasTypes =
      files.includes(`${componentName}.types.ts`) ||
      files.includes(`${componentName}.types.js`);

    if (hasMainComponent || hasStyles || hasTypes) {
      // This looks like a main component folder
      const component = {
        name: componentName,
        dir: componentDir,
        mainComponent: null,
        styles: null,
        types: null,
        subComponents: [],
      };

      // Find the main component files
      files.forEach((file) => {
        const filePath = path.join(componentDir, file);

        if (
          file === `${componentName}.tsx` ||
          file === `${componentName}.jsx` ||
          file === `${componentName}.js`
        ) {
          component.mainComponent = filePath;
        } else if (
          file === `${componentName}.styles.ts` ||
          file === `${componentName}.styles.js`
        ) {
          component.styles = filePath;
        } else if (
          file === `${componentName}.types.ts` ||
          file === `${componentName}.types.js`
        ) {
          component.types = filePath;
        }
      });

      // Look for sub-component folders
      const subDirs = fs
        .readdirSync(componentDir, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => path.join(componentDir, dirent.name));

      subDirs.forEach((subDir) => {
        const subComponentName = path.basename(subDir);

        // Check if this has component files
        const subFiles = fs.readdirSync(subDir);
        const hasSubComponent =
          subFiles.includes(`${subComponentName}.tsx`) ||
          subFiles.includes(`${subComponentName}.jsx`) ||
          subFiles.includes(`${subComponentName}.js`);
        const hasSubStyles =
          subFiles.includes(`${subComponentName}.styles.ts`) ||
          subFiles.includes(`${subComponentName}.styles.js`);
        const hasSubTypes =
          subFiles.includes(`${subComponentName}.types.ts`) ||
          subFiles.includes(`${subComponentName}.types.js`);

        if (hasSubComponent || hasSubStyles || hasSubTypes) {
          const subComponent = {
            name: subComponentName,
            dir: subDir,
            mainComponent: null,
            styles: null,
            types: null,
          };

          // Find sub-component files
          subFiles.forEach((file) => {
            const filePath = path.join(subDir, file);

            if (
              file === `${subComponentName}.tsx` ||
              file === `${subComponentName}.jsx` ||
              file === `${subComponentName}.js`
            ) {
              subComponent.mainComponent = filePath;
            } else if (
              file === `${subComponentName}.styles.ts` ||
              file === `${subComponentName}.styles.js`
            ) {
              subComponent.styles = filePath;
            } else if (
              file === `${subComponentName}.types.ts` ||
              file === `${subComponentName}.types.js`
            ) {
              subComponent.types = filePath;
            }
          });

          component.subComponents.push(subComponent);
        }
      });

      // Only add components that have at least some proper files
      if (component.mainComponent || component.styles || component.types) {
        components.push(component);
      }
    }
  });

  return components;
}

// Find potential components to refactor
function findComponentsToRefactor(files) {
  const potentialComponents = [];

  // Filter to only .tsx, .jsx, .js files
  const componentFiles = files.filter(
    (file) =>
      file.endsWith(".tsx") || file.endsWith(".jsx") || file.endsWith(".js")
  );

  // Skip files in node_modules, etc.
  const filteredFiles = componentFiles.filter(
    (file) =>
      !file.includes("node_modules") &&
      !file.includes("dist") &&
      !file.includes("build")
  );

  // For each file, check if it might be a complex component that needs refactoring
  filteredFiles.forEach((filePath) => {
    try {
      const content = fs.readFileSync(filePath, "utf8");

      // Analyze the content to see if it has potential sub-components
      const hasSubComponents = analyzeForSubComponents(content);

      if (hasSubComponents) {
        const fileName = path.basename(filePath);
        const componentName = fileName.split(".")[0];

        potentialComponents.push({
          name: componentName,
          filePath,
          content,
        });
      }
    } catch (error) {
      console.error(`Error analyzing file ${filePath}:`, error.message);
    }
  });

  return potentialComponents;
}

// Analyze a file for potential sub-components
function analyzeForSubComponents(content) {
  // Look for patterns that suggest sub-components
  // 1. Multiple styled components that might be grouped
  const styledComponentCount =
    (content.match(/styled\./g) || []).length +
    (content.match(/styled\(/g) || []).length;

  // 2. Multiple exports or component definitions
  const componentDefinitionCount = (
    content.match(/const\s+[A-Z][a-zA-Z]*\s*=\s*\(/g) || []
  ).length;

  // 3. References to Header, Content, Footer or similar commonly nested components
  const hasCommonSubComponents =
    content.includes("Header") ||
    content.includes("Content") ||
    content.includes("Footer") ||
    content.includes("Body");

  // Return true if this looks like it has sub-components
  return (
    styledComponentCount > 3 ||
    componentDefinitionCount > 2 ||
    hasCommonSubComponents
  );
}

// Generate sample component data when no actual components are available
function generateSampleComponents() {
  console.log(
    "No existing components found. Generating sample component examples..."
  );

  const sampleComponents = [
    {
      name: "Modal",
      subComponents: [
        { name: "Header" },
        { name: "Content" },
        { name: "Footer" },
      ],
    },
    {
      name: "Accordion",
      subComponents: [{ name: "Item" }, { name: "Panel" }],
    },
    {
      name: "Tabs",
      subComponents: [
        { name: "Tab" },
        { name: "TabList" },
        { name: "TabPanel" },
      ],
    },
  ];

  return sampleComponents.map(generateSampleComponentFiles);
}

// Generate sample component files
function generateSampleComponentFiles(componentInfo) {
  const component = {
    name: componentInfo.name,
    dir: `./sample/${componentInfo.name}`,
    mainComponent: `./sample/${componentInfo.name}/${componentInfo.name}.tsx`,
    styles: `./sample/${componentInfo.name}/${componentInfo.name}.styles.ts`,
    types: `./sample/${componentInfo.name}/${componentInfo.name}.types.ts`,
    subComponents: componentInfo.subComponents.map((sub) => ({
      name: sub.name,
      dir: `./sample/${componentInfo.name}/${sub.name}`,
      mainComponent: `./sample/${componentInfo.name}/${sub.name}/${sub.name}.tsx`,
      styles: `./sample/${componentInfo.name}/${sub.name}/${sub.name}.styles.ts`,
      types: `./sample/${componentInfo.name}/${sub.name}/${sub.name}.types.ts`,
    })),
  };

  return component;
}

// Create training examples for nested components
function createNestedComponentExamples(nestedComponents) {
  const examples = [];

  nestedComponents.forEach((component) => {
    try {
      // For sample components, generate mock file contents
      let files = {};

      if (component.dir.includes("./sample/")) {
        // This is a sample component, generate mock content
        files = generateMockComponentFiles(component);
      } else {
        // This is a real component, read its files
        files = readComponentFiles(component);
      }

      // Create example for complete component creation
      examples.push({
        instruction: `Create a new EdgeBlocks component called ${
          component.name
        } with the following sub-components: ${component.subComponents
          .map((s) => s.name)
          .join(", ")}`,
        output: JSON.stringify(files),
      });

      // Create examples for generating individual sub-components
      component.subComponents.forEach((sub) => {
        let subFiles = {};

        if (component.dir.includes("./sample/")) {
          // Generate mock sub-component files
          subFiles = {
            [`${sub.name}.tsx`]: generateMockSubComponentContent(
              sub.name,
              component.name
            ),
            [`${sub.name}.styles.ts`]: generateMockStylesContent(sub.name),
            [`${sub.name}.types.ts`]: generateMockTypesContent(sub.name),
          };
        } else {
          // Read real sub-component files
          if (sub.mainComponent && fs.existsSync(sub.mainComponent)) {
            subFiles[`${sub.name}.tsx`] = fs.readFileSync(
              sub.mainComponent,
              "utf8"
            );
          }

          if (sub.styles && fs.existsSync(sub.styles)) {
            subFiles[`${sub.name}.styles.ts`] = fs.readFileSync(
              sub.styles,
              "utf8"
            );
          }

          if (sub.types && fs.existsSync(sub.types)) {
            subFiles[`${sub.name}.types.ts`] = fs.readFileSync(
              sub.types,
              "utf8"
            );
          }
        }

        examples.push({
          instruction: `Create a ${sub.name} sub-component for the ${component.name} component following EdgeBlocks standards`,
          output: JSON.stringify(subFiles),
        });
      });
    } catch (error) {
      console.error(
        `Error processing component ${component.name}:`,
        error.message
      );
    }
  });

  return examples;
}

// Read component files from disk
function readComponentFiles(component) {
  const files = {};

  // Main component files
  if (component.mainComponent && fs.existsSync(component.mainComponent)) {
    files[`${component.name}/${component.name}.tsx`] = fs.readFileSync(
      component.mainComponent,
      "utf8"
    );
  }

  if (component.styles && fs.existsSync(component.styles)) {
    files[`${component.name}/${component.name}.styles.ts`] = fs.readFileSync(
      component.styles,
      "utf8"
    );
  }

  if (component.types && fs.existsSync(component.types)) {
    files[`${component.name}/${component.name}.types.ts`] = fs.readFileSync(
      component.types,
      "utf8"
    );
  }

  // Sub-component files
  component.subComponents.forEach((sub) => {
    if (sub.mainComponent && fs.existsSync(sub.mainComponent)) {
      files[`${component.name}/${sub.name}/${sub.name}.tsx`] = fs.readFileSync(
        sub.mainComponent,
        "utf8"
      );
    }

    if (sub.styles && fs.existsSync(sub.styles)) {
      files[`${component.name}/${sub.name}/${sub.name}.styles.ts`] =
        fs.readFileSync(sub.styles, "utf8");
    }

    if (sub.types && fs.existsSync(sub.types)) {
      files[`${component.name}/${sub.name}/${sub.name}.types.ts`] =
        fs.readFileSync(sub.types, "utf8");
    }
  });

  return files;
}

// Generate mock content for a component
function generateMockComponentFiles(component) {
  const files = {};

  // Generate main component files
  files[`${component.name}/${component.name}.tsx`] =
    generateMockMainComponentContent(component);
  files[`${component.name}/${component.name}.styles.ts`] =
    generateMockMainStylesContent(component);
  files[`${component.name}/${component.name}.types.ts`] =
    generateMockMainTypesContent(component);

  // Generate sub-component files
  component.subComponents.forEach((sub) => {
    files[`${component.name}/${sub.name}/${sub.name}.tsx`] =
      generateMockSubComponentContent(sub.name, component.name);
    files[`${component.name}/${sub.name}/${sub.name}.styles.ts`] =
      generateMockStylesContent(sub.name);
    files[`${component.name}/${sub.name}/${sub.name}.types.ts`] =
      generateMockTypesContent(sub.name);
  });

  return files;
}

// Generate mock content for a main component
function generateMockMainComponentContent(component) {
  const imports = component.subComponents
    .map((sub) => `import ${sub.name} from './${sub.name}/${sub.name}';`)
    .join("\n");

  const subComponentUsage = component.subComponents
    .map((sub) => {
      if (sub.name === "Header") {
        return `      <Header title={props.title} onClose={props.onClose} />`;
      } else if (sub.name === "Footer") {
        return `      {props.footer && <Footer>{props.footer}</Footer>}`;
      } else if (sub.name === "Content") {
        return `      <Content>{props.children}</Content>`;
      } else {
        return `      <${sub.name} {...props} />`;
      }
    })
    .join("\n");

  return `import React from 'react';
import { Container } from './${component.name}.styles';
import { I${component.name} } from './${component.name}.types';
${imports}

const ${component.name}: React.FC<I${component.name}> = (props) => {
  return (
    <Container>
${subComponentUsage}
    </Container>
  );
};

export default ${component.name};`;
}

// Generate mock styles for main component
function generateMockMainStylesContent(component) {
  return `import { styled } from '@designSystem';

export const Container = styled('div', {
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid $border',
  borderRadius: '$2',
  overflow: 'hidden',
});`;
}

// Generate mock types for main component
function generateMockMainTypesContent(component) {
  let props = "";

  if (component.subComponents.some((sub) => sub.name === "Header")) {
    props += "  title: string;\n  onClose: () => void;\n";
  }

  if (component.subComponents.some((sub) => sub.name === "Content")) {
    props += "  children: ReactNode;\n";
  }

  if (component.subComponents.some((sub) => sub.name === "Footer")) {
    props += "  footer?: ReactNode;\n";
  }

  return `import { ReactNode } from 'react';

export interface I${component.name} {
${props || "  // Props for the component\n"}
}`;
}

// Generate mock content for a sub-component
function generateMockSubComponentContent(subName, parentName) {
  let props = "";
  let jsx = "";

  if (subName === "Header") {
    props = "{ title, onClose }";
    jsx = `<Container>\n      <Title>{title}</Title>\n      <CloseButton onClick={onClose}>×</CloseButton>\n    </Container>`;
  } else if (subName === "Content") {
    props = "{ children }";
    jsx = `<Container>{children}</Container>`;
  } else if (subName === "Footer") {
    props = "{ children }";
    jsx = `<Container>{children}</Container>`;
  } else {
    props = "props";
    jsx = `<Container {...props} />`;
  }

  return `import React from 'react';
import { Container${
    subName === "Header" ? ", Title, CloseButton" : ""
  } } from './${subName}.styles';
import { I${subName} } from './${subName}.types';

const ${subName}: React.FC<I${subName}> = (${props}) => {
  return (
    ${jsx}
  );
};

export default ${subName};`;
}

// Generate mock styles content
function generateMockStylesContent(name) {
  let additionalStyles = "";

  if (name === "Header") {
    additionalStyles = `
export const Title = styled('h3', {
  margin: 0,
  fontSize: '$lg',
  fontWeight: '$medium',
});

export const CloseButton = styled('button', {
  background: 'none',
  border: 'none',
  fontSize: '$xl',
  cursor: 'pointer',
  padding: '0 $2',
  color: '$textSecondary',
  '&:hover': {
    color: '$text',
  },
});`;
  }

  return `import { styled } from '@designSystem';

export const Container = styled('div', {
  ${
    name === "Header"
      ? "display: 'flex',\n  justifyContent: 'space-between',\n  alignItems: 'center',\n  padding: '$4',\n  borderBottom: '1px solid $border',"
      : name === "Footer"
      ? "padding: '$4',\n  borderTop: '1px solid $border',\n  display: 'flex',\n  justifyContent: 'flex-end',\n  gap: '$2',"
      : "padding: '$4',"
  }
});${additionalStyles}`;
}

// Generate mock types content
function generateMockTypesContent(name) {
  let content = "";

  if (name === "Header") {
    content = `export interface I${name} {
  title: string;
  onClose: () => void;
}`;
  } else if (name === "Content" || name === "Footer") {
    content = `import { ReactNode } from 'react';

export interface I${name} {
  children: ReactNode;
}`;
  } else {
    content = `export interface I${name} {
  // Props for the ${name} component
}`;
  }

  return content;
}

// Create training examples for refactoring to nested structure
function createRefactoringExamples(componentsToRefactor) {
  const examples = [];

  // If we don't have components to refactor, create some sample ones
  if (componentsToRefactor.length === 0) {
    componentsToRefactor = [
      {
        name: "Modal",
        content: `import React, { useState } from 'react';
import styled from 'styled-components';

const ModalOverlay = styled.div\`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
\`;

const ModalContainer = styled.div\`
  background-color: white;
  border-radius: 5px;
  max-width: 500px;
  width: 100%;
  display: flex;
  flex-direction: column;
  max-height: 80vh;
\`;

const ModalHeader = styled.div\`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #eee;
\`;

const ModalTitle = styled.h3\`
  margin: 0;
  font-size: 18px;
\`;

const CloseButton = styled.button\`
  background: none;
  border: none;
  font-size: 24px;
  cursor: pointer;
  color: #888;
  &:hover {
    color: #333;
  }
\`;

const ModalContent = styled.div\`
  padding: 16px;
  overflow-y: auto;
\`;

const ModalFooter = styled.div\`
  padding: 16px;
  border-top: 1px solid #eee;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
\`;

const Modal = ({ isOpen, onClose, title, children, footer }) => {
  if (!isOpen) return null;
  
  return (
    <ModalOverlay onClick={onClose}>
      <ModalContainer onClick={e => e.stopPropagation()}>
        <ModalHeader>
          <ModalTitle>{title}</ModalTitle>
          <CloseButton onClick={onClose}>×</CloseButton>
        </ModalHeader>
        <ModalContent>
          {children}
        </ModalContent>
        {footer && (
          <ModalFooter>
            {footer}
          </ModalFooter>
        )}
      </ModalContainer>
    </ModalOverlay>
  );
};

export default Modal;`,
      },
      {
        name: "Accordion",
        content: `import React, { useState } from 'react';
import styled from 'styled-components';

const AccordionContainer = styled.div\`
  border: 1px solid #eee;
  border-radius: 4px;
  overflow: hidden;
\`;

const AccordionItem = styled.div\`
  border-bottom: 1px solid #eee;
  &:last-child {
    border-bottom: none;
  }
\`;

const AccordionHeader = styled.button\`
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 16px;
  background: none;
  border: none;
  text-align: left;
  font-size: 16px;
  font-weight: 500;
  cursor: pointer;
  &:hover {
    background-color: #f9f9f9;
  }
\`;

const AccordionIcon = styled.span\`
  transition: transform 0.2s ease;
  transform: \${props => props.isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};
\`;

const AccordionPanel = styled.div\`
  padding: \${props => props.isOpen ? '16px' : '0 16px'};
  max-height: \${props => props.isOpen ? '1000px' : '0'};
  overflow: hidden;
  transition: all 0.3s ease;
\`;

const Accordion = ({ items }) => {
  const [openIndex, setOpenIndex] = useState(null);
  
  const handleClick = (index) => {
    setOpenIndex(index === openIndex ? null : index);
  };
  
  return (
    <AccordionContainer>
      {items.map((item, index) => (
        <AccordionItem key={index}>
          <AccordionHeader onClick={() => handleClick(index)}>
            {item.title}
            <AccordionIcon isOpen={index === openIndex}>▼</AccordionIcon>
          </AccordionHeader>
          <AccordionPanel isOpen={index === openIndex}>
            {item.content}
          </AccordionPanel>
        </AccordionItem>
      ))}
    </AccordionContainer>
  );
};

export default Accordion;`,
      },
    ];
  }

  componentsToRefactor.forEach((component) => {
    try {
      // Example of a refactored structure
      const refactoredStructure = {
        [`${component.name}/${component.name}.tsx`]:
          generateMockMainComponentContent({
            name: component.name,
            subComponents:
              component.name === "Modal"
                ? [{ name: "Header" }, { name: "Content" }, { name: "Footer" }]
                : component.name === "Accordion"
                ? [{ name: "Item" }, { name: "Panel" }]
                : [{ name: "Header" }, { name: "Body" }],
          }),

        [`${component.name}/${component.name}.styles.ts`]:
          generateMockMainStylesContent({
            name: component.name,
          }),

        [`${component.name}/${component.name}.types.ts`]:
          generateMockMainTypesContent({
            name: component.name,
            subComponents:
              component.name === "Modal"
                ? [{ name: "Header" }, { name: "Content" }, { name: "Footer" }]
                : component.name === "Accordion"
                ? [{ name: "Item" }, { name: "Panel" }]
                : [{ name: "Header" }, { name: "Body" }],
          }),
      };

      // Add sub-component files
      if (component.name === "Modal") {
        // Add Header sub-component
        refactoredStructure[`${component.name}/Header/Header.tsx`] =
          generateMockSubComponentContent("Header", component.name);
        refactoredStructure[`${component.name}/Header/Header.styles.ts`] =
          generateMockStylesContent("Header");
        refactoredStructure[`${component.name}/Header/Header.types.ts`] =
          generateMockTypesContent("Header");

        // Add Content sub-component
        refactoredStructure[`${component.name}/Content/Content.tsx`] =
          generateMockSubComponentContent("Content", component.name);
        refactoredStructure[`${component.name}/Content/Content.styles.ts`] =
          generateMockStylesContent("Content");
        refactoredStructure[`${component.name}/Content/Content.types.ts`] =
          generateMockTypesContent("Content");

        // Add Footer sub-component
        refactoredStructure[`${component.name}/Footer/Footer.tsx`] =
          generateMockSubComponentContent("Footer", component.name);
        refactoredStructure[`${component.name}/Footer/Footer.styles.ts`] =
          generateMockStylesContent("Footer");
        refactoredStructure[`${component.name}/Footer/Footer.types.ts`] =
          generateMockTypesContent("Footer");
      } else if (component.name === "Accordion") {
        // Add Item sub-component
        refactoredStructure[`${component.name}/Item/Item.tsx`] =
          generateMockSubComponentContent("Item", component.name);
        refactoredStructure[`${component.name}/Item/Item.styles.ts`] =
          generateMockStylesContent("Item");
        refactoredStructure[`${component.name}/Item/Item.types.ts`] =
          generateMockTypesContent("Item");

        // Add Panel sub-component
        refactoredStructure[`${component.name}/Panel/Panel.tsx`] =
          generateMockSubComponentContent("Panel", component.name);
        refactoredStructure[`${component.name}/Panel/Panel.styles.ts`] =
          generateMockStylesContent("Panel");
        refactoredStructure[`${component.name}/Panel/Panel.types.ts`] =
          generateMockTypesContent("Panel");
      } else {
        // Generic sub-components
        refactoredStructure[`${component.name}/Header/Header.tsx`] =
          generateMockSubComponentContent("Header", component.name);
        refactoredStructure[`${component.name}/Header/Header.styles.ts`] =
          generateMockStylesContent("Header");
        refactoredStructure[`${component.name}/Header/Header.types.ts`] =
          generateMockTypesContent("Header");

        refactoredStructure[`${component.name}/Body/Body.tsx`] =
          generateMockSubComponentContent("Body", component.name);
        refactoredStructure[`${component.name}/Body/Body.styles.ts`] =
          generateMockStylesContent("Body");
        refactoredStructure[`${component.name}/Body/Body.types.ts`] =
          generateMockTypesContent("Body");
      }

      // Create refactoring example
      examples.push({
        instruction: `Refactor this ${component.name} component to follow the EdgeBlocks nested component structure, with separate folders for sub-components`,
        input: component.content,
        output: JSON.stringify(refactoredStructure),
      });
    } catch (error) {
      console.error(
        `Error creating refactoring example for ${component.name}:`,
        error.message
      );
    }
  });

  // Add some general examples of the nesting pattern
  examples.push({
    instruction: `Explain the EdgeBlocks component structure for components with sub-components`,
    output: `EdgeBlocks follows a structured pattern for components with sub-components:

    1. Main component folder: /{ComponentName}/
       - {ComponentName}.tsx - Main component file
       - {ComponentName}.styles.ts - Styles for the main component
       - {ComponentName}.types.ts - TypeScript interfaces for the main component
    
    2. Sub-component folders: /{ComponentName}/{SubComponentName}/
       - {SubComponentName}.tsx - Sub-component implementation
       - {SubComponentName}.styles.ts - Styles specific to the sub-component
       - {SubComponentName}.types.ts - TypeScript interfaces for the sub-component
    
    This structure keeps related code organized while maintaining a clear hierarchy. Sub-components should be used for discrete pieces of functionality within the main component, not just for styled elements (which belong in the .styles.ts files).
    
    Example folder structure for a Modal component:
    /Modal/
      Modal.tsx
      Modal.styles.ts
      Modal.types.ts
      /Header/
        Header.tsx
        Header.styles.ts
        Header.types.ts
      /Content/
        Content.tsx
        Content.styles.ts
        Content.types.ts
      /Footer/
        Footer.tsx
        Footer.styles.ts
        Footer.types.ts`,
  });

  return examples;
}

// Main function to process components
function processNestedComponents(files, rootDir) {
  console.log(`Looking for nested components in directory: ${rootDir}`);

  // Find existing nested components if the directory exists
  let nestedComponents = [];
  if (fs.existsSync(rootDir)) {
    nestedComponents = findNestedComponents(rootDir);
    console.log(`Found ${nestedComponents.length} existing nested components.`);
  } else {
    console.log(
      `Directory ${rootDir} does not exist. Skipping existing component search.`
    );
  }

  // If no components were found, generate sample components
  if (nestedComponents.length === 0) {
    nestedComponents = generateSampleComponents();
    console.log(
      `Generated ${nestedComponents.length} sample components for training.`
    );
  }

  // Find potential components to refactor
  const componentsToRefactor = findComponentsToRefactor(files);
  console.log(
    `Found ${componentsToRefactor.length} components that could be refactored to nested structure.`
  );

  // Create examples for nested components
  const nestedExamples = createNestedComponentExamples(nestedComponents);

  // Create examples for refactoring
  const refactoringExamples = createRefactoringExamples(componentsToRefactor);

  // Combine all examples
  const allExamples = [...nestedExamples, ...refactoringExamples];

  // Write to JSONL file
  const outputPath = path.join(config.outputDir, config.examplesFile);
  const jsonlContent = allExamples.map((ex) => JSON.stringify(ex)).join("\n");
  fs.writeFileSync(outputPath, jsonlContent);

  console.log(
    `Created ${allExamples.length} training examples for nested components.`
  );
  console.log(`Examples saved to: ${outputPath}`);
}

// Get directory paths
function getSourceDirectories() {
  // Check for command line arguments
  const args = process.argv.slice(2);

  // If specific directories were provided, use them
  if (args.length > 0) {
    return args.filter((dir) => fs.existsSync(dir));
  }

  // Default locations to check for component directories
  const possibleDirs = [
    "./src/components",
    "./components",
    "./src/ui",
    "./ui",
    "./src",
  ];

  // Return first directory that exists, or current directory as fallback
  for (const dir of possibleDirs) {
    if (fs.existsSync(dir)) {
      return [dir];
    }
  }

  // If none exist, just use current directory
  return ["./"];
}

// If this file is run directly
if (require.main === module) {
  // Get potential source directories
  const sourceDirs = getSourceDirectories();
  console.log(
    `Searching for components in directories: ${sourceDirs.join(", ")}`
  );

  // Read source files from the previous list or find files in directories
  const fileListPath = path.join(config.dataDir, "source_files.txt");
  let files = [];

  if (fs.existsSync(fileListPath)) {
    files = fs.readFileSync(fileListPath, "utf8").split("\n").filter(Boolean);
    console.log(`Found ${files.length} files in source_files.txt`);
  } else {
    // Find files in the directories
    sourceDirs.forEach((dir) => {
      if (fs.existsSync(dir)) {
        const foundFiles = findFilesRecursive(dir, [
          ".tsx",
          ".jsx",
          ".js",
          ".ts",
        ]);
        files.push(...foundFiles);
      }
    });
    console.log(`Found ${files.length} files in source directories`);

    // Save the file list for future use
    if (files.length > 0) {
      fs.writeFileSync(fileListPath, files.join("\n"));
    }
  }

  // Process the components in all source directories
  sourceDirs.forEach((dir) => {
    processNestedComponents(files, dir);
  });
}

// Helper function to find files recursively
function findFilesRecursive(dir, extensions) {
  if (!fs.existsSync(dir)) {
    return [];
  }

  const results = [];

  const items = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of items) {
    const fullPath = path.join(dir, item.name);

    // Skip node_modules and other irrelevant directories
    if (
      item.name === "node_modules" ||
      item.name === ".git" ||
      item.name === "dist" ||
      item.name === "build"
    ) {
      continue;
    }

    if (item.isDirectory()) {
      // Recursively search directories
      results.push(...findFilesRecursive(fullPath, extensions));
    } else {
      // Check if file extension matches
      const ext = path.extname(item.name);
      if (extensions.includes(ext)) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

module.exports = { processNestedComponents };
