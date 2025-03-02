import os
# Set environment variables for better download handling
os.environ['HF_HUB_ENABLE_HF_TRANSFER'] = '1'
os.environ['HF_ENDPOINT'] = 'https://huggingface.co'
os.environ['HF_HUB_OFFLINE'] = '0'
os.environ['HF_HUB_DISABLE_SYMLINKS_WARNING'] = '1'

# Increase timeout for downloads
import huggingface_hub
huggingface_hub.constants.HF_HUB_ETAG_TIMEOUT = 15
huggingface_hub.constants.HF_HUB_DOWNLOAD_TIMEOUT = 300

from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, Trainer
from datasets import load_dataset
from peft import get_peft_model, LoraConfig, TaskType, prepare_model_for_kbit_training
import torch

# Use DeepSeek Coder V2 Lite Base model
model_name = "deepseek-ai/DeepSeek-Coder-V2-Lite-Base"
output_dir = "./finetuned-model"
training_file = "./training-data/edgeblocks_training-data.jsonl"
num_epochs = 5  # More epochs for small dataset
batch_size = 1
gradient_accumulation_steps = 4
learning_rate = 2e-4  # Higher learning rate for LoRA

print(f"Loading model: {model_name}")
# Use LoRA for efficient fine-tuning with longer timeout
try:
    print("Downloading tokenizer first...")
    tokenizer = AutoTokenizer.from_pretrained(model_name, trust_remote_code=True)
    print("Tokenizer loaded successfully")

    print("Now downloading model (this may take a while)...")
    # Try to download with more conservative settings if needed
    model = AutoModelForCausalLM.from_pretrained(
        model_name, 
        trust_remote_code=True,
        device_map="auto",
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    print("Model loaded successfully")
except Exception as e:
    print(f"Error loading model: {str(e)}")
    print("Trying alternative loading method...")
    # Try a more direct approach if the first fails
    from huggingface_hub import snapshot_download
    
    print("Downloading model files...")
    model_path = snapshot_download(
        repo_id=model_name,
        local_files_only=False,
        revision="main",
        ignore_patterns=["*.bin", "*.safetensors", "*.msgpack"],  # First get the code files
    )
    print(f"Downloaded model code to {model_path}")
    
    print("Now loading the model...")
    tokenizer = AutoTokenizer.from_pretrained(model_path, trust_remote_code=True)
    model = AutoModelForCausalLM.from_pretrained(
        model_path,
        trust_remote_code=True,
        device_map="auto",
        torch_dtype=torch.float16,
        low_cpu_mem_usage=True,
    )
    print("Model loaded successfully with alternative method")

print(f"Loading dataset: {training_file}")
dataset = load_dataset('json', data_files=training_file)
print(f"Dataset loaded: {dataset}")

# Print a sample from the dataset
print("\nSample from dataset:")
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
    # Check what format the data is in
    if "instruction" in examples and "output" in examples:
        # Format: instruction/output
        texts = [f"### Instruction: {instruction}\n### Response: {output}" 
                 for instruction, output in zip(examples["instruction"], examples["output"])]
    elif "input" in examples and "output" in examples:
        # Format: input/output
        texts = [f"### Input: {input}\n### Output: {output}" 
                 for input, output in zip(examples["input"], examples["output"])]
    else:
        # Just use whatever fields are available
        texts = []
        for i in range(len(examples[next(iter(examples))])):
            text = ""
            for key in examples:
                if i < len(examples[key]) and examples[key][i]:
                    text += f"### {key}: {examples[key][i]}\n"
            texts.append(text)
    
    return tokenizer(texts, padding="max_length", truncation=True, max_length=1024)

print("Tokenizing dataset...")
tokenized_dataset = dataset.map(tokenize_function, batched=True)
print("Dataset tokenized")

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
    # Set fp16 to False for Windows compatibility
    fp16=False, 
    # Add this for Windows compatibility
    dataloader_drop_last=False,
    # Add group_by_length=False for small datasets
    group_by_length=False,
    # Add report to remove warning
    report_to="none"
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
print("\nTo use this model:")
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
