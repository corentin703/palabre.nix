{
  description = "Palabre : visioconférence autohébergée (PlugNMeet + LiveKit + NATS) pour NixOS";

  # Binary cache for packages.<system>.palabre-landing (pushed by CI). Mirrored in the README.
  nixConfig = {
    extra-substituters = [ "https://palabre.cachix.org" ];
    extra-trusted-public-keys = [ "palabre.cachix.org-1:llE6p76J47pEBXVonV3bdqn+Qhms1fn6JMqDzR9SAXw=" ];
  };

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-26.05";

    # Podman containers pinned by digest. No `follows` on nixpkgs: wanted by
    # pin-oci (binary cache).
    pin-oci.url = "github:corentin703/pin-oci.nix";
  };

  # The module expects the host to provide pin-oci. It knows no secrets manager:
  # it takes file paths (services.palabre.secrets.*). pin-oci is an input of this
  # flake only to lock it (`pin-oci lock --flake .#lock`) and test it.
  outputs =
    {
      self,
      nixpkgs,
      pin-oci,
    }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
      ];
      forAllSystems = f: nixpkgs.lib.genAttrs systems (system: f nixpkgs.legacyPackages.${system});
    in
    {
      nixosModules = {
        # The landing page comes from this flake's package (built and cached by CI):
        # without it, it would be rebuilt with the host's nixpkgs, outside the cache.
        palabre =
          { lib, pkgs, ... }:
          let
            package = self.packages.${pkgs.stdenv.hostPlatform.system} or { };
          in
          {
            imports = [ ./module ];
            services.palabre.landing.package = lib.mkIf (package ? palabre-landing) (
              lib.mkDefault package.palabre-landing
            );
          };
        default = self.nixosModules.palabre;
      };

      # Example configuration: locks the images and serves as an evaluation test.
      nixosConfigurations.lock = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          pin-oci.nixosModules.default
          self.nixosModules.palabre
          ./examples/lock
        ];
      };

      packages = forAllSystems (pkgs: rec {
        palabre-landing = pkgs.callPackage ./module/landing/package.nix { };
        default = palabre-landing;
      });

      devShells = forAllSystems (pkgs: {
        default = pkgs.mkShell {
          packages = [ pin-oci.packages.${pkgs.stdenv.hostPlatform.system}.pin-oci ];
        };
      });

      checks.x86_64-linux =
        let
          pkgs = nixpkgs.legacyPackages.x86_64-linux;
          config = self.nixosConfigurations.lock.config;
        in
        {
          landing = self.packages.x86_64-linux.palabre-landing;

          # The module evaluates, with no failed assertion (locked images included).
          example-evaluates =
            let
              failed = nixpkgs.lib.filter (a: !a.assertion) config.assertions;
            in
            assert nixpkgs.lib.assertMsg (failed == [ ]) (
              builtins.concatStringsSep "\n" (map (a: a.message) failed)
            );
            pkgs.writeText "palabre-example" (
              builtins.toJSON (builtins.attrNames config.virtualisation.oci-containers.containers)
            );

          nixfmt = pkgs.runCommand "palabre-nixfmt" { nativeBuildInputs = [ pkgs.nixfmt ]; } ''
            nixfmt --check ${self}/flake.nix ${self}/module ${self}/examples
            touch $out
          '';
        };

      formatter = forAllSystems (pkgs: pkgs.nixfmt);
    };
}
