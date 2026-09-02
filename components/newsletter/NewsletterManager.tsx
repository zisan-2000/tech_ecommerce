"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { AlertCircle, Plus, Send, Edit, Trash2, Eye } from "lucide-react";
import JoditEditorComponent from "@/components/admin/blog/JoditEditor";

interface Newsletter {
  id: string;
  title: string;
  subject: string;
  content: string;
  status: string;
  sentAt?: string;
  createdAt: string;
}

const API_BASE = "/api/newsletter";

export default function NewsletterManagement() {
  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [previewNewsletter, setPreviewNewsletter] = useState<Newsletter | null>(
    null,
  );
  const [editingNewsletter, setEditingNewsletter] = useState<Newsletter | null>(
    null,
  );
  const [formData, setFormData] = useState({
    title: "",
    subject: "",
    content: "",
  });

  const showToast = useCallback(
    (title: string, description: string, variant: string = "default") => {
      toast({
        title,
        description,
        variant: variant as "default" | "destructive",
      });
    },
    [],
  );

  const fetchNewsletters = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(API_BASE);
      if (response.ok) {
        const data = await response.json();
        setNewsletters(data);
      } else {
        throw new Error("Failed to fetch newsletters");
      }
    } catch (error) {
      console.error("Failed to fetch newsletters:", error);
      showToast("Error", "Failed to fetch newsletters", "destructive");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchNewsletters();
  }, [fetchNewsletters]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const url = editingNewsletter
        ? `${API_BASE}/${editingNewsletter.id}`
        : API_BASE;
      const method = editingNewsletter ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (response.ok) {
        showToast(
          "Success",
          `Newsletter ${editingNewsletter ? "updated" : "created"} successfully`,
        );
        fetchNewsletters();
        setIsCreateDialogOpen(false);
        setIsEditDialogOpen(false);
        setEditingNewsletter(null);
        setFormData({ title: "", subject: "", content: "" });
      } else {
        throw new Error("Failed to save newsletter");
      }
    } catch (error) {
      console.error("Failed to save newsletter:", error);
      showToast("Error", "Failed to save newsletter", "destructive");
    }
  };

  const handleSend = async (id: string) => {
    try {
      setSendingId(id);
      setSendError(null);
      const response = await fetch(`${API_BASE}/${id}/send`, {
        method: "POST",
      });
      const result = await response.json();

      if (response.ok) {
        showToast("Success", result.message || "Newsletter sent successfully");
        setSendError(null);
        fetchNewsletters();
      } else {
        throw new Error(result.error || "Failed to send newsletter");
      }
    } catch (error) {
      console.error("Failed to send newsletter:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Failed to send newsletter";
      const displayMessage =
        errorMessage === "No subscribers found."
          ? "No subscribed recipients found. Please add at least one active subscriber before sending this newsletter."
          : errorMessage;
      setSendError(displayMessage);
      showToast(
        "Error",
        displayMessage,
        "destructive",
      );
    } finally {
      setSendingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingId) return;

    try {
      const response = await fetch(`${API_BASE}/${deletingId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        showToast("Success", "Newsletter deleted successfully");
        fetchNewsletters();
      } else {
        throw new Error("Failed to delete newsletter");
      }
    } catch (error) {
      console.error("Failed to delete newsletter:", error);
      showToast("Error", "Failed to delete newsletter", "destructive");
    } finally {
      setDeletingId(null);
      setIsDeleteDialogOpen(false);
    }
  };

  const openDeleteDialog = useCallback((id: string) => {
    setDeletingId(id);
    setIsDeleteDialogOpen(true);
  }, []);

  const openEditDialog = useCallback((newsletter: Newsletter) => {
    setEditingNewsletter(newsletter);
    setFormData({
      title: newsletter.title,
      subject: newsletter.subject,
      content: newsletter.content,
    });
    setIsEditDialogOpen(true);
  }, []);

  const openPreviewDialog = useCallback((newsletter: Newsletter) => {
    setPreviewNewsletter(newsletter);
    setIsPreviewOpen(true);
  }, []);

  const resetForm = useCallback(() => {
    setEditingNewsletter(null);
    setFormData({ title: "", subject: "", content: "" });
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-foreground">Loading newsletters...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Create Newsletter Button */}
      <div className="flex justify-end mb-6">
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button
              onClick={() => {
                resetForm();
                setIsCreateDialogOpen(true);
              }}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 rounded-full transition-all duration-300 hover:shadow-lg hover:scale-105 border border-primary"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Newsletter
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl mx-4 max-h-[90vh] overflow-y-auto bg-background border border-border rounded-2xl shadow-2xl">
            <DialogHeader className="border-b border-border pb-4">
              <DialogTitle className="text-xl font-semibold text-foreground">
                Create New Newsletter
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6 pt-4">
              <div>
                <Label htmlFor="title" className="text-foreground font-medium">
                  Title
                </Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  className="bg-muted border-border focus:border-primary text-foreground placeholder-muted-foreground transition-colors duration-300"
                  required
                />
              </div>
              <div>
                <Label
                  htmlFor="subject"
                  className="text-foreground font-medium"
                >
                  Subject
                </Label>
                <Input
                  id="subject"
                  value={formData.subject}
                  onChange={(e) =>
                    setFormData({ ...formData, subject: e.target.value })
                  }
                  className="bg-muted border-border focus:border-primary text-foreground placeholder-muted-foreground transition-colors duration-300"
                  required
                />
              </div>
              <div>
                <Label
                  htmlFor="content"
                  className="text-foreground font-medium"
                >
                  Content
                </Label>
                <div className="border border-border rounded-lg overflow-hidden">
                  <JoditEditorComponent
                    placeholder="Enter newsletter content..."
                    initialValue={formData.content}
                    onContentChange={(content) =>
                      setFormData({ ...formData, content })
                    }
                    height="300px"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:scale-105 border border-primary"
              >
                Create Newsletter
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {sendError && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-destructive"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Newsletter was not sent</p>
            <p className="text-sm leading-relaxed">{sendError}</p>
          </div>
        </div>
      )}

      {/* Newsletter Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {newsletters.map((newsletter) => (
          <Card
            key={newsletter.id}
            className="bg-card border border-border rounded-2xl shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105 overflow-hidden"
          >
            <CardHeader className="bg-muted/50 border-b border-border">
              <div className="flex justify-between items-start gap-3">
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-lg font-semibold text-foreground truncate">
                    {newsletter.title}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                    {newsletter.subject}
                  </p>
                </div>
                <div
                  className={`px-3 py-1 rounded-full text-xs font-semibold border ${
                    newsletter.status === "sent"
                      ? "bg-green-100/20 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800"
                      : "bg-orange-100/20 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400 border-orange-200 dark:border-orange-800"
                  }`}
                >
                  {newsletter.status === "sent" ? "পাঠানো হয়েছে" : "খসড়া"}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div
                className="text-muted-foreground text-sm mb-4 line-clamp-3 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: newsletter.content }}
              />
              <div className="text-xs text-muted-foreground border-t border-border pt-3 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">তৈরি:</span>
                  <span>
                    {new Date(newsletter.createdAt).toLocaleDateString("bn-BD")}
                  </span>
                </div>
                {newsletter.sentAt && (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <span className="font-bold">পাঠানো:</span>
                    <span>
                      {new Date(newsletter.sentAt).toLocaleDateString("bn-BD")}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openPreviewDialog(newsletter)}
                  className="border-border text-foreground hover:bg-muted hover:border-primary rounded-lg transition-all duration-300"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  Preview
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDialog(newsletter)}
                  className="border-border text-foreground hover:bg-muted hover:border-primary rounded-lg transition-all duration-300"
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Edit
                </Button>
                {newsletter.status !== "sent" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sendingId === newsletter.id}
                    onClick={() => handleSend(newsletter.id)}
                    className="border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20 rounded-lg transition-all duration-300"
                  >
                    <Send className="h-4 w-4 mr-1" />
                    {sendingId === newsletter.id ? "Sending..." : "Send"}
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => openDeleteDialog(newsletter.id)}
                  className="rounded-lg transition-all duration-300"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {newsletters.length === 0 && (
        <div className="text-center py-12">
          <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Send className="w-10 h-10 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold text-foreground mb-2">
            No newsletters yet
          </h3>
          <p className="text-muted-foreground mb-6">
            Create your first newsletter to get started
          </p>
          <Button
            onClick={() => {
              resetForm();
              setIsCreateDialogOpen(true);
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold px-6 rounded-full transition-all duration-300 hover:shadow-lg hover:scale-105 border border-primary"
          >
            <Plus className="mr-2 h-4 w-4" />
            Create Newsletter
          </Button>
        </div>
      )}

      {/* Preview Dialog */}
      <Dialog open={isPreviewOpen} onOpenChange={setIsPreviewOpen}>
        <DialogContent className="max-w-2xl mx-4 max-h-[90vh] overflow-y-auto bg-background border border-border rounded-2xl shadow-2xl">
          <DialogHeader className="border-b border-[#D1D8BE] pb-4">
            <DialogTitle className="text-xl font-semibold text-[#0D1414]">
              Preview Newsletter
            </DialogTitle>
          </DialogHeader>
          {previewNewsletter && (
            <div className="space-y-4 pt-4">
              <div className="bg-muted/50 rounded-xl p-4 border border-border">
                <h2 className="text-xl font-bold text-foreground mb-2">
                  {previewNewsletter.title}
                </h2>
                <p className="text-muted-foreground font-medium">
                  {previewNewsletter.subject}
                </p>
              </div>
              <div
                className="bg-muted rounded-xl p-6 border border-border leading-relaxed"
                dangerouslySetInnerHTML={{ __html: previewNewsletter.content }}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl mx-4 max-h-[90vh] overflow-y-auto bg-background border border-border rounded-2xl shadow-2xl">
          <DialogHeader className="border-b border-[#D1D8BE] pb-4">
            <DialogTitle className="text-xl font-semibold text-[#0D1414]">
              Edit Newsletter
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6 pt-4">
            <div>
              <Label
                htmlFor="edit-title"
                className="text-foreground font-medium"
              >
                Title
              </Label>
              <Input
                id="edit-title"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
                className="bg-muted border-border focus:border-primary text-foreground placeholder-muted-foreground transition-colors duration-300"
                required
              />
            </div>
            <div>
              <Label
                htmlFor="edit-subject"
                className="text-foreground font-medium"
              >
                Subject
              </Label>
              <Input
                id="edit-subject"
                value={formData.subject}
                onChange={(e) =>
                  setFormData({ ...formData, subject: e.target.value })
                }
                className="bg-muted border-border focus:border-primary text-foreground placeholder-muted-foreground transition-colors duration-300"
                required
              />
            </div>
            <div>
              <Label
                htmlFor="edit-content"
                className="text-foreground font-medium"
              >
                Content
              </Label>
              <div className="border border-border rounded-lg overflow-hidden">
                <JoditEditorComponent
                  placeholder="Enter newsletter content..."
                  initialValue={formData.content}
                  onContentChange={(content) =>
                    setFormData({ ...formData, content })
                  }
                  height="300px"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold rounded-xl transition-all duration-300 hover:shadow-lg hover:scale-105 border border-primary"
            >
              Update Newsletter
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent className="max-w-sm mx-4 bg-background border border-border rounded-2xl shadow-2xl p-6">
          <DialogHeader className="border-b border-border pb-3 mb-4">
            <DialogTitle className="text-xl font-semibold text-destructive">
              Confirm Deletion
            </DialogTitle>
          </DialogHeader>
          <p className="text-foreground mb-6">
            Are you sure you want to delete this newsletter? This action cannot
            be undone.
          </p>
          <div className="flex justify-end gap-3">
            <Button
              onClick={() => setIsDeleteDialogOpen(false)}
              className="bg-muted text-foreground hover:bg-muted/80 rounded-lg transition-all"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDelete}
              className="bg-destructive hover:bg-destructive/90 text-white rounded-lg transition-all"
            >
              Delete Permanently
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
