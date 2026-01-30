'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  FileText,
  Users,
  CheckCircle2,
  MessageSquare,
  Workflow,
  Shield,
  ArrowRight,
  BookOpen,
  Palette,
  Printer,
  Eye,
  Clock,
  BarChart3,
} from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              {/* Logo placeholder */}
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                Wevalid
              </span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-sm text-slate-600 hover:text-slate-900 transition">
                Fonctionnalités
              </a>
              <a href="#workflow" className="text-sm text-slate-600 hover:text-slate-900 transition">
                Workflow
              </a>
              <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900 transition">
                Tarifs
              </a>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" asChild>
                <Link href="/login">Connexion</Link>
              </Button>
              <Button asChild className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700">
                <Link href="/login">Commencer</Link>
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 text-sm font-medium mb-8">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-600"></span>
              </span>
              Production éditoriale simplifiée
            </div>
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight text-slate-900 mb-6">
              Gérez vos projets
              <span className="block bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                éditoriaux sans effort
              </span>
            </h1>
            <p className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto">
              Wevalid centralise la gestion de vos livres, de la maquette au BAT.
              Annotations PDF, suivi de workflow, collaboration en temps réel.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="lg" asChild className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-lg px-8">
                <Link href="/login">
                  Essayer gratuitement
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
              <Button size="lg" variant="outline" asChild className="text-lg px-8">
                <a href="#features">Découvrir</a>
              </Button>
            </div>
          </div>

          {/* Hero Image Placeholder */}
          <div className="mt-16 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative mx-auto max-w-5xl rounded-2xl border bg-slate-100 shadow-2xl overflow-hidden aspect-[16/10]">
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <div className="text-center">
                  <Eye className="h-16 w-16 mx-auto mb-4 opacity-50" />
                  <p className="text-lg">Capture d&apos;écran de l&apos;interface</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Logos Section */}
      <section className="py-12 border-y bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm text-slate-500 mb-8">
            Ils nous font confiance
          </p>
          <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50">
            {/* Logo placeholders */}
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-8 w-24 bg-slate-300 rounded" />
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Tout ce dont vous avez besoin
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Une plateforme complète pour gérer le cycle de vie de vos publications
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-indigo-100 flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-indigo-600" />
                </div>
                <CardTitle>Annotations PDF</CardTitle>
                <CardDescription>
                  Annotez directement sur les PDF. Surlignage, commentaires,
                  corrections visuelles avec export XFDF pour Acrobat.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-purple-100 flex items-center justify-center mb-4">
                  <Workflow className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle>Workflow automatisé</CardTitle>
                <CardDescription>
                  Suivez chaque page à travers les étapes : maquette, validation,
                  photogravure, BAT. Notifications automatiques.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-pink-100 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-pink-600" />
                </div>
                <CardTitle>Collaboration multi-rôles</CardTitle>
                <CardDescription>
                  Auteurs, éditeurs, graphistes, photograveurs, fabricants.
                  Chaque rôle a ses permissions et vues adaptées.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center mb-4">
                  <MessageSquare className="h-6 w-6 text-amber-600" />
                </div>
                <CardTitle>Suivi des corrections</CardTitle>
                <CardDescription>
                  Historique complet des modifications. Résolution des annotations.
                  Traçabilité de chaque intervention.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-emerald-100 flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-emerald-600" />
                </div>
                <CardTitle>Verrouillage BAT</CardTitle>
                <CardDescription>
                  Les pages validées sont automatiquement verrouillées.
                  Protection contre les modifications accidentelles.
                </CardDescription>
              </CardHeader>
            </Card>

            <Card className="border-0 shadow-lg hover:shadow-xl transition-shadow">
              <CardHeader>
                <div className="w-12 h-12 rounded-lg bg-cyan-100 flex items-center justify-center mb-4">
                  <BarChart3 className="h-6 w-6 text-cyan-600" />
                </div>
                <CardTitle>Dashboard en temps réel</CardTitle>
                <CardDescription>
                  Vue d&apos;ensemble de l&apos;avancement. Statistiques par statut.
                  Identification rapide des blocages.
                </CardDescription>
              </CardHeader>
            </Card>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="workflow" className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Un workflow pensé pour l&apos;édition
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              De la réception des éléments à l&apos;envoi imprimeur, chaque étape est tracée
            </p>
          </div>

          <div className="relative">
            {/* Connection line */}
            <div className="hidden lg:block absolute top-1/2 left-0 right-0 h-0.5 bg-gradient-to-r from-indigo-200 via-purple-200 to-emerald-200 -translate-y-1/2" />

            <div className="grid grid-cols-2 lg:grid-cols-5 gap-8">
              {[
                { icon: BookOpen, label: 'Éléments reçus', color: 'indigo' },
                { icon: Palette, label: 'Maquette', color: 'purple' },
                { icon: Eye, label: 'Validation', color: 'pink' },
                { icon: CheckCircle2, label: 'BAT', color: 'emerald' },
                { icon: Printer, label: 'Impression', color: 'cyan' },
              ].map((step, i) => (
                <div key={i} className="relative flex flex-col items-center text-center">
                  <div className={`w-16 h-16 rounded-full bg-${step.color}-100 flex items-center justify-center mb-4 relative z-10 border-4 border-white shadow-lg`}>
                    <step.icon className={`h-8 w-8 text-${step.color}-600`} />
                  </div>
                  <span className="font-medium text-slate-900">{step.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-16 grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-indigo-600 mb-2">10+</div>
              <div className="text-slate-600">Statuts de workflow</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-600 mb-2">6</div>
              <div className="text-slate-600">Rôles métier</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-emerald-600 mb-2">100%</div>
              <div className="text-slate-600">Traçabilité</div>
            </div>
          </div>
        </div>
      </section>

      {/* Roles Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Pour chaque acteur de la chaîne
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { role: 'Éditeur', desc: 'Supervise le projet, valide les étapes clés, gère les équipes' },
              { role: 'Auteur', desc: 'Fournit les contenus, valide les maquettes, annote les corrections' },
              { role: 'Graphiste', desc: 'Crée les maquettes, intègre les corrections, prépare les fichiers' },
              { role: 'Photograveur', desc: 'Traite les images, prépare les fichiers HD pour impression' },
              { role: 'Fabricant', desc: 'Coordonne la production, suit l\'avancement, gère les délais' },
              { role: 'Admin', desc: 'Configure les projets, gère les accès, débloque les situations' },
            ].map((item, i) => (
              <div key={i} className="p-6 rounded-xl border bg-white hover:border-indigo-200 transition">
                <h3 className="font-semibold text-lg text-slate-900 mb-2">{item.role}</h3>
                <p className="text-slate-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-4 sm:px-6 lg:px-8 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Tarification simple et transparente
            </h2>
            <p className="text-lg text-slate-600">
              Commencez gratuitement, évoluez selon vos besoins
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {/* Free Plan */}
            <Card className="border-2">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">Découverte</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">0€</span>
                  <span className="text-slate-500">/mois</span>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {['1 projet actif', '3 utilisateurs', 'Annotations PDF', 'Workflow de base'].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button variant="outline" className="w-full mt-6" asChild>
                  <Link href="/login">Commencer</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Pro Plan */}
            <Card className="border-2 border-indigo-500 relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-indigo-500 text-white text-xs font-medium rounded-full">
                Populaire
              </div>
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">Pro</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">49€</span>
                  <span className="text-slate-500">/mois</span>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {['Projets illimités', '20 utilisateurs', 'Export XFDF Acrobat', 'Notifications email', 'Support prioritaire'].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button className="w-full mt-6 bg-gradient-to-r from-indigo-600 to-purple-600" asChild>
                  <Link href="/login">Essai gratuit 14 jours</Link>
                </Button>
              </CardContent>
            </Card>

            {/* Enterprise Plan */}
            <Card className="border-2">
              <CardHeader className="text-center pb-2">
                <CardTitle className="text-xl">Entreprise</CardTitle>
                <div className="mt-4">
                  <span className="text-4xl font-bold">Sur mesure</span>
                </div>
              </CardHeader>
              <CardContent className="pt-6">
                <ul className="space-y-3">
                  {['Tout illimité', 'SSO / SAML', 'API complète', 'SLA garanti', 'Accompagnement dédié'].map((feature, i) => (
                    <li key={i} className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Button variant="outline" className="w-full mt-6">
                  Nous contacter
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-6">
            Prêt à simplifier votre production éditoriale ?
          </h2>
          <p className="text-xl text-slate-600 mb-10">
            Rejoignez les maisons d&apos;édition qui ont choisi Wevalid
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-lg px-8">
              <Link href="/login">
                Créer un compte gratuit
                <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="text-lg px-8">
              <Clock className="mr-2 h-5 w-5" />
              Demander une démo
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-4 sm:px-6 lg:px-8 border-t bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center">
                  <BookOpen className="h-4 w-4 text-white" />
                </div>
                <span className="font-bold">Wevalid</span>
              </div>
              <p className="text-sm text-slate-500">
                La plateforme de production éditoriale nouvelle génération.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Produit</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#features" className="hover:text-slate-900">Fonctionnalités</a></li>
                <li><a href="#pricing" className="hover:text-slate-900">Tarifs</a></li>
                <li><a href="#" className="hover:text-slate-900">Changelog</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Ressources</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#" className="hover:text-slate-900">Documentation</a></li>
                <li><a href="#" className="hover:text-slate-900">Guides</a></li>
                <li><a href="#" className="hover:text-slate-900">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Légal</h4>
              <ul className="space-y-2 text-sm text-slate-500">
                <li><a href="#" className="hover:text-slate-900">Confidentialité</a></li>
                <li><a href="#" className="hover:text-slate-900">CGU</a></li>
                <li><a href="#" className="hover:text-slate-900">Mentions légales</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t text-center text-sm text-slate-500">
            © {new Date().getFullYear()} Wevalid. Tous droits réservés.
          </div>
        </div>
      </footer>
    </div>
  );
}
