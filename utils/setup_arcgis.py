#!/usr/bin/env python3
"""
ArcGIS Experience Builder Setup Script

Downloads and extracts ArcGIS Experience Builder to the ArcGIS directory
while preserving custom extensions and public files.
"""

import sys
import shutil
import zipfile
from pathlib import Path
from typing import Optional

# Import existing utility functions from the same directory
from download_arcgis import download_arcgis_builder

# Global configuration
DEFAULT_VERSION = "1.19"
DEFAULT_TARGET_DIR = "ArcGIS"
PRESERVED_FOLDERS = [
    "client/your-extensions",
    "server/public"
]
PRESERVED_FILES = [
    "client/start-client.bat",
    "server/start-server.bat"
]


def get_base_path(target_dir: str) -> Path:
    """Get the resolved base path for the target directory."""
    return (Path(__file__).parent.parent / target_dir).resolve()


def remove_path_if_exists(path: Path) -> None:
    """Remove a file or directory if it exists."""
    if path.exists():
        if path.is_dir():
            shutil.rmtree(path)
        else:
            path.unlink()


def clean_directory_contents(base_path: Path, exclude_pattern: str = ".temp_") -> None:
    """
    Remove all contents from a directory except items matching exclude pattern.
    
    Args:
        base_path: Directory to clean
        exclude_pattern: Pattern to exclude from deletion
    """
    print(f"Cleaning directory: {base_path}")
    for item in base_path.iterdir():
        if item.name.startswith(exclude_pattern):
            continue
        try:
            if item.is_dir():
                shutil.rmtree(item)
                print(f"  Removed directory: {item.name}")
            else:
                item.unlink()
                print(f"  Removed file: {item.name}")
        except Exception as e:
            print(f"  Warning: Could not remove {item.name}: {e}")


def ensure_custom_directories(base_path: Path) -> None:
    """
    Ensure all preserved directories and file parent directories exist.
    
    Args:
        base_path: Base ArcGIS directory path
    """
    print("Ensuring custom directories exist...")
    
    # Collect all directories to create
    dirs_to_create = set(PRESERVED_FOLDERS)
    
    # Add parent directories for preserved files
    for file_path_str in PRESERVED_FILES:
        full_file_path = base_path / file_path_str
        parent_path = full_file_path.parent
        dirs_to_create.add(str(parent_path.relative_to(base_path)))
    
    # Create all directories
    for dir_path_str in dirs_to_create:
        dir_path = base_path / dir_path_str
        dir_path.mkdir(parents=True, exist_ok=True)
        print(f"  [OK] {dir_path}")


def preserve_custom_folders(base_path: Path) -> tuple[list[Optional[Path]], list[Optional[Path]]]:
    """
    Temporarily move custom folders and files if they exist.
    
    Args:
        base_path: Base ArcGIS directory path
        
    Returns:
        Tuple of (temp_folders, temp_files) - lists of temporary paths (None for items that don't exist)
    """
    # Combine folders and files for unified processing
    all_paths = PRESERVED_FOLDERS + PRESERVED_FILES
    temp_items: list[Optional[Path]] = []
    
    for path_str in all_paths:
        full_path = base_path / path_str
        temp_path: Optional[Path] = None
        
        if full_path.exists():
            # Create a unique temp name based on the preserved path
            temp_name = f".temp_{path_str.replace('/', '_').replace('-', '_')}"
            temp_path = base_path / temp_name
            
            # Clean up any existing temp item first
            remove_path_if_exists(temp_path)
            
            print(f"Preserving {full_path}...")
            shutil.move(str(full_path), str(temp_path))
        
        temp_items.append(temp_path)
    
    # Split back into separate lists
    num_folders = len(PRESERVED_FOLDERS)
    temp_folders = temp_items[:num_folders]
    temp_files = temp_items[num_folders:]
    
    return temp_folders, temp_files


def restore_custom_folders_and_files(
    base_path: Path,
    temp_folders: list[Optional[Path]],
    temp_files: list[Optional[Path]]
) -> None:
    """
    Restore custom folders and files after extraction.
    
    Args:
        base_path: Base ArcGIS directory path
        temp_folders: List of temporary folder paths
        temp_files: List of temporary file paths
    """
    # Combine folders and files for unified processing
    all_paths = PRESERVED_FOLDERS + PRESERVED_FILES
    all_temps = temp_folders + temp_files
    
    for path_str, temp_path in zip(all_paths, all_temps):
        if temp_path and temp_path.exists():
            full_path = base_path / path_str
            print(f"Restoring {full_path}...")
            
            # Remove the existing item if it exists
            remove_path_if_exists(full_path)
            
            # Ensure parent directory exists if needed
            if not full_path.exists():
                full_path.parent.mkdir(parents=True, exist_ok=True)
            
            shutil.move(str(temp_path), str(full_path))


def extract_and_move_files(zip_path: Path, base_path: Path) -> bool:
    """
    Extract zip file and move contents to target directory.
    
    Args:
        zip_path: Path to the zip file
        base_path: Target directory for extracted files
        
    Returns:
        True if successful, False otherwise
    """
    print(f"Extracting {zip_path.name}...")
    print(f"  Zip location: {zip_path}")
    
    # Clean up any existing temp extraction directory
    temp_extract = zip_path.parent / '.temp_extract'
    if temp_extract.exists():
        print(f"  Removing existing temp extraction directory: {temp_extract}")
        shutil.rmtree(temp_extract)
    
    try:
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Extract to temporary location
            print(f"  Extracting to: {temp_extract}")
            zip_ref.extractall(temp_extract)
            
            # Check if files are in a subdirectory or at root
            source_dir = temp_extract / 'ArcGISExperienceBuilder'
            if not source_dir.exists():
                source_dir = temp_extract
            
            # Move contents to target directory
            print(f"  Moving contents from {source_dir} to {base_path}")
            for item in source_dir.iterdir():
                dest = base_path / item.name
                print(f"    Moving {item.name}...")
                remove_path_if_exists(dest)
                shutil.move(str(item), str(dest))
            
            # Clean up temp extraction directory
            shutil.rmtree(temp_extract)
        
        print(f"Extracted to: {base_path}")
        return True
        
    except Exception as e:
        print(f"Error extracting zip file: {e}")
        return False


def download_zip(version: str, zip_path: Path) -> bool:
    """
    Download ArcGIS zip file, removing existing file if needed.
    
    Args:
        version: Version to download
        zip_path: Path where zip will be saved
        
    Returns:
        True if successful, False otherwise
    """
    print(f"Downloading version {version}...")
    
    # Delete existing zip file if it exists
    if zip_path.exists():
        print(f"  Removing existing zip file: {zip_path}")
        zip_path.unlink()
    
    return download_arcgis_builder(version)


def print_success_message(base_path: Path, version: str) -> None:
    """Print success message with directory structure."""
    print("\n" + "=" * 60)
    print(f"[SUCCESS] ArcGIS Experience Builder {version} setup complete!")
    print(f"\nPreserved items:")
    print("  Folders:")
    for folder_path_str in PRESERVED_FOLDERS:
        print(f"    - {folder_path_str}")
    print("  Files:")
    for file_path_str in PRESERVED_FILES:
        print(f"    - {file_path_str}")


def clean_arcgis_directory(target_dir: str = DEFAULT_TARGET_DIR) -> bool:
    """
    Clean the ArcGIS directory while preserving custom folders.
    
    Args:
        target_dir: Target directory to clean (relative to parent directory)
        
    Returns:
        True if successful, False otherwise
    """
    base_path = get_base_path(target_dir)
    
    print(f"Cleaning ArcGIS Experience Builder Directory")
    print("=" * 60)
    
    if not base_path.exists():
        print(f"Directory does not exist: {base_path}")
        return True
    
    # Preserve, clean, restore, and ensure directories exist
    print("\nStep 1: Preserving custom folders and files...")
    temp_folders, temp_files = preserve_custom_folders(base_path)
    
    print(f"\nStep 2: Removing all files from: {base_path}")
    clean_directory_contents(base_path)
    
    print("\nStep 3: Restoring custom folders and files...")
    restore_custom_folders_and_files(base_path, temp_folders, temp_files)
    
    print("\nStep 4: Ensuring custom directories exist...")
    ensure_custom_directories(base_path)
    
    print("\n" + "=" * 60)
    print(f"✓ ArcGIS directory cleaned successfully!")
    
    return True


def setup_arcgis_builder(version: str = DEFAULT_VERSION, target_dir: str = DEFAULT_TARGET_DIR) -> bool:
    """
    Download and extract ArcGIS Experience Builder to target directory.
    
    Args:
        version: ArcGIS Experience Builder version (e.g., "1.19")
        target_dir: Target directory to extract to (relative to parent directory)
        
    Returns:
        True if successful, False otherwise
    """
    base_path = get_base_path(target_dir)
    zip_filename = f"arcgis-experience-builder-{version}.zip"
    zip_path = Path.cwd() / zip_filename
    
    print(f"ArcGIS Experience Builder Setup - Version {version}")
    print("=" * 60)
    
    # Step 1: Preserve custom folders and files
    print("\nStep 1: Preserving custom folders and files...")
    temp_folders, temp_files = preserve_custom_folders(base_path)
    
    # Step 2: Clean existing directory or create if needed
    if base_path.exists():
        print(f"\nStep 2: Cleaning existing directory: {base_path}")
        clean_directory_contents(base_path)
    else:
        print(f"\nStep 2: Creating directory: {base_path}")
        base_path.mkdir(parents=True, exist_ok=True)
    
    # Step 3: Download the zip file
    print(f"\nStep 3: Downloading version {version}...")
    if not download_zip(version, zip_path):
        print("Error: Download failed")
        restore_custom_folders_and_files(base_path, temp_folders, temp_files)
        return False
    
    # Step 4: Extract the zip file
    print(f"\nStep 4: Extracting {zip_filename}...")
    if not extract_and_move_files(zip_path, base_path):
        restore_custom_folders_and_files(base_path, temp_folders, temp_files)
        return False
    
    # Step 5: Clean up zip file
    print(f"\nStep 5: Cleaning up {zip_filename}...")
    try:
        zip_path.unlink()
    except Exception as e:
        print(f"Warning: Could not delete zip file: {e}")
    
    # Step 6: Restore custom folders and files
    print("\nStep 6: Restoring custom folders and files...")
    restore_custom_folders_and_files(base_path, temp_folders, temp_files)
    
    # Step 7: Ensure custom directories exist
    print("\nStep 7: Ensuring custom directories exist...")
    ensure_custom_directories(base_path)
    
    print_success_message(base_path, version)
    
    return True


def show_help() -> None:
    """Display help information."""
    print("Usage: python setup-arcgis.py [version|clean] [target_dir]")
    print(f"\nDefault version: {DEFAULT_VERSION}")
    print(f"Default target directory: {DEFAULT_TARGET_DIR}")
    print("\nCommands:")
    print("  <version>  Download and setup specific version (e.g., 1.19)")
    print("  clean      Clean ArcGIS directory while preserving custom folders")
    print("  -h, --help Show this help message")
    print("\nExamples:")
    print("  python setup-arcgis.py              # Uses default version")
    print("  python setup-arcgis.py 1.19")
    print("  python setup-arcgis.py 1.19 ArcGIS")
    print("  python setup-arcgis.py clean")
    print("  python setup-arcgis.py clean ArcGIS")


def main() -> None:
    """Main entry point."""
    # Handle help command
    if len(sys.argv) >= 2 and sys.argv[1].lower() in ("-h", "--help", "help"):
        show_help()
        sys.exit(0)
    
    # Default to setup with DEFAULT_VERSION if no arguments provided
    if len(sys.argv) < 2:
        print(f"No arguments provided. Using default version: {DEFAULT_VERSION}")
        print("=" * 60)
        success: bool = setup_arcgis_builder(DEFAULT_VERSION, DEFAULT_TARGET_DIR)
        sys.exit(0 if success else 1)
    
    command: str = sys.argv[1]
    target_dir: str = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_TARGET_DIR
    
    if command.lower() == "clean":
        success: bool = clean_arcgis_directory(target_dir)
    else:
        # Treat as version number
        version: str = command
        success: bool = setup_arcgis_builder(version, target_dir)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
