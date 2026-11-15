{
  description = "Palabre : visioconférence autohébergée (PlugNMeet + LiveKit + NATS) pour NixOS";

  inputs = {
    nixpkgs.url = "github:nixos/nixpkgs/nixos-26.05";

    # Conteneurs Podman verrouillés par digest. Pas de `follows` sur nixpkgs : voulu par
    # pin-oci (cache binaire).
    pin-oci.url = "github:corentin703/pin-oci.nix";

    sops-nix = {
      url = "github:Mic92/sops-nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  # Le module suppose que l'hôte fournit pin-oci et sops-nix ; ils ne sont des entrées de ce
  # flake que pour le verrouiller (`pin-oci lock --flake .#lock`) et le tester.
  outputs =
    {
      self,
      nixpkgs,
      pin-oci,
      sops-nix,
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
        # La page d'accueil vient du paquet de ce flake (construit et mis en cache par la CI) :
        # sans cela, elle serait recompilée avec le nixpkgs de l'hôte, hors du cache.
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

      # Configuration d'exemple : verrouille les images et sert de test d'évaluation.
      nixosConfigurations.lock = nixpkgs.lib.nixosSystem {
        system = "x86_64-linux";
        modules = [
          pin-oci.nixosModules.default
          sops-nix.nixosModules.sops
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

          # Le module s'évalue, sans assertion en échec (images verrouillées comprises).
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
