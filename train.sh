#!/bin/bash

# Final DeepSeek Coder V2 Lite Base fine-tuning script
# Fixed to disable hf_transfer and improve download reliability

# Script configuration
MODEL_NAME="deepseek-ai/DeepSeek-Coder-V2-Lite-Base"
MODEL_DIR="D:/projects/models/deepseek-ai/DeepSeek-Coder-V2-Lite-Base"  # Custom directory for downloaded model files
OUTPUT_DIR="./finetuned-model"
TRAINING_DATA_DIR="./training-data"

# Function to print messages
print_message() {
  echo "[TRAINER] $1"
}

print_warning() {
  echo "[WARNING] $1"
}

print_error() {
  echo "[ERROR] $1"
}

# Find training data
print_message "Checking for training data..."
JSONL_FILES=()

# List all JSONL files in training-data directory
for file in $TRAINING_DATA_DIR/*.jsonl; do
  if [ -f "$file" ]; then
    JSONL_FILES+=("$file")
    echo "Found JSONL file: $file"
  fi
done

# If no files found, exit
if [ ${#JSONL_FILES[@]} -eq 0 ]; then
  print_error "No JSONL files found in $TRAINING_DATA_DIR"
  print_message "Please make sure your training data is in the $TRAINING_DATA_DIR directory with .jsonl extension"
  exit 1
fi

# Use the first JSONL file found
TRAINING_DATA="${JSONL_FILES[0]}"
print_message "Using training data: $TRAINING_DATA"

# Check if the file exists and has content
if [ ! -f "$TRAINING_DATA" ]; then
  print_error "Training file does not exist: $TRAINING_DATA"
  exit 1
fi

LINE_COUNT=$(wc -l < "$TRAINING_DATA" 2>/dev/null || echo "0")
print_message "Training file has $LINE_COUNT examples"

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Use python3 command but fall back to python if needed
if command -v python3 >/dev/null 2>&1; then
  PYTHON="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON="python"
else
  print_error "Python not found. Please install Python 3.8+ from python.org"
  print_message "Make sure to check 'Add Python to PATH' during installation"
  exit 1
fi

# Install hf_transfer or we'll fix the script to disable it
print_message "Checking for hf_transfer package..."
$PYTHON -m pip install --quiet hf_transfer || true

# Create a final Python training script
print_message "Creating the final Python training script..."

cat > final_training.py << PYEOF
import os
# Disable hf_transfer and use standard download instead
os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '0'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'
os.environ['TRANSFORMERS_OFFLINE'] = '0'
# Long download timeout
os.environ['TRANSFORMERS_REQUEST_TIMEOUT'] = '500'

from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from datasets import load_dataset
from peft import get_peft_model, LoraConfig, TaskType, prepare_model_for_kbit_training
import torch
import time

# Use DeepSeek Coder V2 Lite Base model
model_name = "${MODEL_NAME}"
model_dir = "${MODEL_DIR}"  # Custom directory for downloaded model files
output_dir = "${OUTPUT_DIR}"
training_file = "${TRAINING_DATA}"
num_epochs = 5  # More epochs for small dataset
batch_size = 1
gradient_accumulation_steps = 4
learning_rate = 2e-4  # Higher learning rate for LoRA

print(f"Loading model from: {model_dir}")

# Function to load model and tokenizer from custom directory
def load_model_from_custom_dir():
    try:
        print("Loading tokenizer...")
        tokenizer = AutoTokenizer.from_pretrained(
            model_dir,
            trust_remote_code=True,
            local_files_only=True,  # Ensure no redownloading
        )
        print("Tokenizer loaded successfully")

        print("Loading model (this may take a while)...")
        model = AutoModelForCausalLM.from_pretrained(
            model_dir,
            trust_remote_code=True,
            device_map={"": "cpu"},  # Start on CPU to save memory
            torch_dtype=torch.float32,  # Use standard precision initially
            low_cpu_mem_usage=True,
            local_files_only=True,  # Ensure no redownloading
        )
        print("Model loaded successfully")
        return model, tokenizer
    except Exception as e:
        print(f"Failed to load model: {str(e)}")
        print(f"Please ensure the model files are correctly placed in: {model_dir}")
        exit(1)

# Load the model and tokenizer
try:
    model, tokenizer = load_model_from_custom_dir()
except Exception as e:
    print(f"Failed to load model after multiple attempts: {str(e)}")
    print("For direct download, visit: https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Base")
    exit(1)

print(f"Loading dataset: {training_file}")
dataset = load_dataset('json', data_files=training_file)
print(f"Dataset loaded: {dataset}")

# Print a sample from the dataset
print("\\nSample from dataset:")
print(dataset["train"][0])

# Configure LoRA
print("Configuring LoRA...")
# Prepare model for LoRA fine-tuning
model = prepare_model_for_kbit_training(model)

# Define LoRA configuration for DeepSeek Coder
lora_config = LoraConfig(
    r=8,  # Rank dimension
    lora_alpha=16,  # Alpha parameter for LoRA scaling
    target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],  # Attention module matrices 
    lora_dropout=0.05,  # Dropout probability for LoRA layers
    bias="none",  # Don't train bias parameters
    task_type=TaskType.CAUSAL_LM  # The task type (causal language modeling)
)

# Get LoRA model
model = get_peft_model(model, lora_config)
print("LoRA applied to model")

# Print trainable parameters
model.print_trainable_parameters()

# Tokenize the data
def tokenize_function(examples):
    # Tokenize the input text
    tokenized_inputs = tokenizer(
        examples["instruction"] if "instruction" in examples else examples["input"],
        padding="max_length",
        truncation=True,
        max_length=1024,
        return_tensors="pt",
    )
    
    # Use the input IDs as labels (shifted by one token for causal LM)
    tokenized_inputs["labels"] = tokenized_inputs["input_ids"].clone()
    
    return tokenized_inputs

print("Tokenizing dataset...")
tokenized_dataset = dataset.map(tokenize_function, batched=True)
print("Dataset tokenized")

# Find the latest checkpoint
import glob
checkpoints = sorted(glob.glob(f"{output_dir}/checkpoint-*"), key=os.path.getmtime)
if checkpoints:
    latest_checkpoint = checkpoints[-1]
    print(f"Resuming training from checkpoint: {latest_checkpoint}")
else:
    latest_checkpoint = None
    print("No checkpoints found. Starting training from scratch.")

# Set up training arguments
training_args = TrainingArguments(
    output_dir=output_dir,
    overwrite_output_dir=True,
    num_train_epochs=num_epochs,
    per_device_train_batch_size=batch_size,
    gradient_accumulation_steps=gradient_accumulation_steps,
    learning_rate=learning_rate,
    warmup_ratio=0.03,  # 3% of steps used for warmup
    logging_steps=1,
    save_steps=5,
    save_total_limit=3,
    fp16=False, 
    dataloader_drop_last=False,
    group_by_length=False,
    report_to="none",
    label_names=["input_ids"],  # Add this line
    resume_from_checkpoint=latest_checkpoint,  # Resume from the latest checkpoint
)

# Create a Trainer
trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=tokenized_dataset["train"],
)

# Start training
print("Starting training with LoRA...")
trainer.train()

# Save the model
print("Saving model...")
model.save_pretrained(output_dir)
tokenizer.save_pretrained(output_dir)
print(f"Training complete! Model saved to {output_dir}")
print("\\nTo use this model:")
print("""
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel, PeftConfig

# Load the LoRA configuration
config = PeftConfig.from_pretrained("./finetuned-model")

# Load the base model
model = AutoModelForCausalLM.from_pretrained(
    config.base_model_name_or_path,
    trust_remote_code=True
)

# Load the fine-tuned LoRA weights
model = PeftModel.from_pretrained(model, "./finetuned-model")
tokenizer = AutoTokenizer.from_pretrained(config.base_model_name_or_path, trust_remote_code=True)

# Example usage
prompt = "Create a new EdgeBlocks component and call it: Button"
inputs = tokenizer(prompt, return_tensors="pt")
outputs = model.generate(**inputs, max_length=500)
print(tokenizer.decode(outputs[0]))
""")
PYEOF

print_message "Starting DeepSeek Coder V2 Lite fine-tuning with final script..."
print_message "The script will retry downloads with increasing wait times if needed."
print_message "This process may take 10-15 minutes to complete. Please be patient."

$PYTHON final_training.py

training_status=$?

if [ $training_status -eq 0 ]; then
  print_message "Training complete! LoRA model saved to $OUTPUT_DIR"
  print_message "You can now use your fine-tuned model as shown in the instructions at the end of the output."
else
  print_error "Training failed with status code $training_status"
  print_error "Please check the error messages above for more information."
  
  print_message "Manual Download Instructions:"
  echo "1. Visit https://huggingface.co/deepseek-ai/DeepSeek-Coder-V2-Lite-Base"
  echo "2. Click the 'Files and versions' tab"
  echo "3. Download the necessary files to a local directory"
  echo "4. Use 'local_dir=' parameter when loading the model in Python"
fi