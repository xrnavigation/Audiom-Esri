#!/usr/bin/env python3
"""
ArcGIS Experience Builder Setup Script

Downloads and extracts ArcGIS Experience Builder to the ArcGIS directory
while preserving custom extensions and public files.
"""

import sys
import shutil
from pathlib import Path
from typing import Optional

# Import existing utility functions from the same directory
from download_arcgis import download_arcgis_builder


def preserve_custom_folders(base_path: Path) -> tuple[Optional[Path], Optional[Path]]:
    """
    Temporarily move custom folders if they exist.
    
    Args:
        base_path: Base ArcGIS directory path
        
    Returns:
        Tuple of (extensions_temp_path, public_temp_path)
    """
    extensions_path = base_path / 'client' / 'your-extensions'
    public_path = base_path / 'server' / 'public'
    
    extensions_temp: Optional[Path] = None
    public_temp: Optional[Path] = None
    
    # Preserve your-extensions folder
    if extensions_path.exists():
        extensions_temp = base_path / '.temp_your_extensions'
        print(f"Preserving {extensions_path}...")
        shutil.move(str(extensions_path), str(extensions_temp))
    
    # Preserve public folder
    if public_path.exists():
        public_temp = base_path / '.temp_public'
        print(f"Preserving {public_path}...")
        shutil.move(str(public_path), str(public_temp))
    
    return extensions_temp, public_temp


def restore_custom_folders(
    base_path: Path,
    extensions_temp: Optional[Path],
    public_temp: Optional[Path]
) -> None:
    """
    Restore custom folders after extraction.
    
    Args:
        base_path: Base ArcGIS directory path
        extensions_temp: Temporary extensions folder path
        public_temp: Temporary public folder path
    """
    # Restore your-extensions folder
    if extensions_temp and extensions_temp.exists():
        extensions_path = base_path / 'client' / 'your-extensions'
        print(f"Restoring {extensions_path}...")
        if extensions_path.exists():
            shutil.rmtree(extensions_path)
        shutil.move(str(extensions_temp), str(extensions_path))
    
    # Restore public folder
    if public_temp and public_temp.exists():
        public_path = base_path / 'server' / 'public'
        print(f"Restoring {public_path}...")
        if public_path.exists():
            shutil.rmtree(public_path)
        shutil.move(str(public_temp), str(public_path))


def clean_arcgis_directory(target_dir: str = "../ArcGIS") -> bool:
    """
    Clean the ArcGIS directory while preserving custom folders.
    
    Args:
        target_dir: Target directory to clean (relative to parent directory)
        
    Returns:
        True if successful, False otherwise
    """
    # Resolve path relative to the parent directory (project root)
    base_path = (Path(__file__).parent.parent / target_dir).resolve()
    
    print(f"Cleaning ArcGIS Experience Builder Directory")
    print("=" * 60)
    
    if not base_path.exists():
        print(f"Directory does not exist: {base_path}")
        return True
    
    # Step 1: Preserve custom folders
    print("\nStep 1: Preserving custom folders...")
    extensions_temp, public_temp = preserve_custom_folders(base_path)
    
    # Step 2: Clean entire directory
    print(f"\nStep 2: Removing all files from: {base_path}")
    for item in base_path.iterdir():
        if item.name.startswith('.temp_'):
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
    
    # Step 3: Restore custom folders
    print("\nStep 3: Restoring custom folders...")
    restore_custom_folders(base_path, extensions_temp, public_temp)
    
    # Step 4: Ensure custom directories exist
    print("\nStep 4: Ensuring custom directories exist...")
    extensions_path = base_path / 'client' / 'your-extensions'
    public_path = base_path / 'server' / 'public'
    
    extensions_path.mkdir(parents=True, exist_ok=True)
    public_path.mkdir(parents=True, exist_ok=True)
    
    print(f"  ✓ {extensions_path}")
    print(f"  ✓ {public_path}")
    
    print("\n" + "=" * 60)
    print(f"✓ ArcGIS directory cleaned successfully!")
    
    return True


def setup_arcgis_builder(version: str, target_dir: str = "../ArcGIS") -> bool:
    """
    Download and extract ArcGIS Experience Builder to target directory.
    
    Args:
        version: ArcGIS Experience Builder version (e.g., "1.19")
        target_dir: Target directory to extract to (relative to parent directory)
        
    Returns:
        True if successful, False otherwise
    """
    # Resolve path relative to the parent directory (project root)
    base_path = (Path(__file__).parent.parent / target_dir).resolve()
    zip_filename = f"arcgis-experience-builder-{version}.zip"
    
    print(f"ArcGIS Experience Builder Setup - Version {version}")
    print("=" * 60)
    
    # Step 1: Preserve custom folders
    print("\nStep 1: Preserving custom folders...")
    extensions_temp, public_temp = preserve_custom_folders(base_path)
    
    # Step 2: Clean existing ArcGIS directory (except temp folders)
    if base_path.exists():
        print(f"\nStep 2: Cleaning existing directory: {base_path}")
        for item in base_path.iterdir():
            if item.name.startswith('.temp_'):
                continue
            if item.is_dir():
                shutil.rmtree(item)
            else:
                item.unlink()
    else:
        print(f"\nStep 2: Creating directory: {base_path}")
        base_path.mkdir(parents=True, exist_ok=True)
    
    # Step 3: Download the zip file
    print(f"\nStep 3: Downloading version {version}...")
    if not download_arcgis_builder(version):
        print("Error: Download failed")
        # Restore folders even on failure
        restore_custom_folders(base_path, extensions_temp, public_temp)
        return False
    
    # Step 4: Extract the zip file
    print(f"\nStep 4: Extracting {zip_filename}...")
    try:
        import zipfile
        
        with zipfile.ZipFile(zip_filename, 'r') as zip_ref:
            # Extract to temporary location
            temp_extract = Path('.temp_extract')
            zip_ref.extractall(temp_extract)
            
            # Move contents from ArcGISExperienceBuilder to target directory
            source_dir = temp_extract / 'ArcGISExperienceBuilder'
            if source_dir.exists():
                for item in source_dir.iterdir():
                    dest = base_path / item.name
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    shutil.move(str(item), str(dest))
            
            # Clean up temp extraction directory
            shutil.rmtree(temp_extract)
        
        print(f"Extracted to: {base_path}")
        
    except Exception as e:
        print(f"Error extracting zip file: {e}")
        # Restore folders on failure
        restore_custom_folders(base_path, extensions_temp, public_temp)
        return False
    
    # Step 5: Clean up zip file
    print(f"\nStep 5: Cleaning up {zip_filename}...")
    try:
        Path(zip_filename).unlink()
    except Exception as e:
        print(f"Warning: Could not delete zip file: {e}")
    
    # Step 6: Restore custom folders
    print("\nStep 6: Restoring custom folders...")
    restore_custom_folders(base_path, extensions_temp, public_temp)
    
    # Step 7: Ensure custom directories exist (create if they don't)
    print("\nStep 7: Ensuring custom directories exist...")
    extensions_path = base_path / 'client' / 'your-extensions'
    public_path = base_path / 'server' / 'public'
    
    extensions_path.mkdir(parents=True, exist_ok=True)
    public_path.mkdir(parents=True, exist_ok=True)
    
    print(f"  ✓ {extensions_path}")
    print(f"  ✓ {public_path}")
    
    print("\n" + "=" * 60)
    print(f"✓ ArcGIS Experience Builder {version} setup complete!")
    print(f"\nDirectory structure:")
    print(f"  {base_path}/")
    print(f"    ├── client/")
    print(f"    │   └── your-extensions/  (preserved)")
    print(f"    └── server/")
    print(f"        └── public/           (preserved)")
    
    return True


def main() -> None:
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python setup-arcgis.py <version|clean> [target_dir]")
        print("\nCommands:")
        print("  <version>  Download and setup specific version (e.g., 1.19)")
        print("  clean      Clean ArcGIS directory while preserving custom folders")
        print("\nExamples:")
        print("  python setup-arcgis.py 1.19")
        print("  python setup-arcgis.py 1.19 ../ArcGIS")
        print("  python setup-arcgis.py clean")
        print("  python setup-arcgis.py clean ../ArcGIS")
        sys.exit(1)
    
    command: str = sys.argv[1]
    target_dir: str = sys.argv[2] if len(sys.argv) > 2 else "../ArcGIS"
    
    if command.lower() == "clean":
        success: bool = clean_arcgis_directory(target_dir)
    else:
        # Treat as version number
        version: str = command
        success: bool = setup_arcgis_builder(version, target_dir)
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()
